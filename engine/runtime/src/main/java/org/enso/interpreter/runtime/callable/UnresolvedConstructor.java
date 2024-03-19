package org.enso.interpreter.runtime.callable;

import com.oracle.truffle.api.CompilerDirectives;
import com.oracle.truffle.api.dsl.Bind;
import com.oracle.truffle.api.dsl.Cached;
import com.oracle.truffle.api.dsl.Specialization;
import com.oracle.truffle.api.frame.MaterializedFrame;
import com.oracle.truffle.api.frame.VirtualFrame;
import com.oracle.truffle.api.instrumentation.InstrumentableNode.WrapperNode;
import com.oracle.truffle.api.interop.InteropLibrary;
import com.oracle.truffle.api.library.ExportLibrary;
import com.oracle.truffle.api.library.ExportMessage;
import com.oracle.truffle.api.nodes.Node;
import com.oracle.truffle.api.nodes.NodeUtil;
import com.oracle.truffle.api.source.SourceSection;
import java.util.Arrays;
import java.util.Objects;
import java.util.concurrent.locks.Lock;
import org.enso.interpreter.node.ExpressionNode;
import org.enso.interpreter.node.callable.FunctionCallInstrumentationNode;
import org.enso.interpreter.node.callable.InvokeCallableNode.ArgumentsExecutionMode;
import org.enso.interpreter.node.callable.InvokeCallableNode.DefaultsExecutionMode;
import org.enso.interpreter.node.callable.dispatch.InvokeFunctionNode;
import org.enso.interpreter.runtime.EnsoContext;
import org.enso.interpreter.runtime.callable.argument.CallArgumentInfo;
import org.enso.interpreter.runtime.data.EnsoObject;
import org.enso.interpreter.runtime.data.Type;
import org.enso.interpreter.runtime.data.atom.AtomConstructor;
import org.enso.interpreter.runtime.library.dispatch.TypesLibrary;
import org.enso.interpreter.runtime.state.State;

/**
 * Value representing a by-name identified constructor of a yet unknown {@link Type}. Create new
 * instance by providing name to {@link #build(String)} method. Then apply arguments to it via
 * {@link #withArguments(Object[])} method.
 *
 * <p>Let the object flow thru the interpreter and resolve it when the required {@link Type} is
 * known.
 */
@ExportLibrary(InteropLibrary.class)
@ExportLibrary(TypesLibrary.class)
public final class UnresolvedConstructor implements EnsoObject {
  private static final CallArgumentInfo[] NONE = new CallArgumentInfo[0];
  private final String name;
  private final Node where;
  final CallArgumentInfo[] descs;
  private final Object[] args;

  /**
   * Creates a new unresolved name.
   *
   * @param name constructor name
   * @param where where the constructor was constructed
   * @param descs argument descriptions to apply to the constructor
   * @param args argument values to apply to the constructor
   */
  private UnresolvedConstructor(String name, Node where, CallArgumentInfo[] descs, Object[] args) {
    this.name = name;
    this.where = where;
    this.descs = descs;
    this.args = args;
  }

  final String getName() {
    return name;
  }

  @Override
  @CompilerDirectives.TruffleBoundary
  public String toString() {
    return ".." + name;
  }

  @ExportMessage
  String toDisplayString(boolean allowSideEffects) {
    return toString();
  }

  /**
   * Creates an instance of this node.
   *
   * @param name the name (of the constructor) we are searching for
   * @return a object representing unresolved (constructor)
   */
  public static UnresolvedConstructor build(String name) {
    return new UnresolvedConstructor(name, null, NONE, NONE);
  }

  /**
   * Marks this object as executable through the interop library.
   *
   * @param where location where the unresolved constructor is constructed
   * @param additionalDescriptions description of the applied arguments
   * @param additionalArguments new arguments to add to the unresolved constructor
   * @return always true @ExportMessage public boolean isExecutable() { return true; }
   */
  public UnresolvedConstructor withArguments(
      Node where, CallArgumentInfo[] additionalDescriptions, Object[] additionalArguments) {
    if (this.args == NONE) {
      return new UnresolvedConstructor(
          this.name, where, additionalDescriptions, additionalArguments);
    } else {
      var newDescs = join(this.descs, additionalDescriptions);
      var newArgs = join(this.args, additionalArguments);
      return new UnresolvedConstructor(this.name, where, newDescs, newArgs);
    }
  }

  final UnresolvedConstructor asPrototype() {
    return new UnresolvedConstructor(this.name, this.where, this.descs, null);
  }

  final boolean sameAsPrototyped(UnresolvedConstructor other) {
    if (descs.length != other.descs.length) {
      return false;
    }
    if (where != other.where) {
      return false;
    }
    if (!name.equals(other.name)) {
      return false;
    }
    for (var i = 0; i < descs.length; i++) {
      if (!Objects.equals(descs[i].getName(), other.descs[i].getName())) {
        return false;
      }
    }
    return true;
  }

  private static <T> T[] join(T[] arr1, T[] arr2) {
    var ret = Arrays.copyOf(arr1, arr1.length + arr2.length);
    System.arraycopy(arr2, 0, ret, arr1.length, arr2.length);
    return ret;
  }

  /** */
  public abstract static class ConstructNode extends Node {
    @Child private InvokeFunctionNode invoke;
    @CompilerDirectives.CompilationFinal SourceSection where;

    public abstract Object execute(
        VirtualFrame frame, State state, Type expectedType, UnresolvedConstructor unresolved);

    @Override
    public SourceSection getSourceSection() {
      return where;
    }

    private static InvokeFunctionNode buildInvokeNode(UnresolvedConstructor prototype) {
      var node =
          InvokeFunctionNode.build(
              prototype.descs, DefaultsExecutionMode.EXECUTE, ArgumentsExecutionMode.EXECUTE);
      var where = NodeUtil.findParent(prototype.where, ExpressionNode.class);
      if (where != null) {
        node.setId(where.getId());
      }
      return node;
    }

    @Specialization(
        guards = {"cachedType == expectedType", "prototype.sameAsPrototyped(unresolved)"},
        limit = "10")
    Object instantiateCached(
        VirtualFrame frame,
        State state,
        Type expectedType,
        UnresolvedConstructor unresolved,
        @Cached("expectedType") Type cachedType,
        @Cached("unresolved.asPrototype()") UnresolvedConstructor prototype,
        @Cached("expectedType.getConstructors().get(prototype.getName())") AtomConstructor c) {
      if (c == null) {
        return null;
      } else {
        if (invoke == null) {
          CompilerDirectives.transferToInterpreterAndInvalidate();
          Lock lock = getLock();
          lock.lock();
          try {
            invoke = insert(buildInvokeNode(prototype));
            where = prototype.where.getSourceSection();
            notifyInserted(invoke);
            assert invoke.getSourceSection() != null;

            var all = NodeUtil.findAllNodeInstances(this, FunctionCallInstrumentationNode.class);
            assert all.size() == 2 : "Wrapper and real node: " + all;
            assert all.get(0) instanceof WrapperNode : "Wrapper: " + all;
          } finally {
            lock.unlock();
          }
        }
        var fn = c.getConstructorFunction();
        var r = invoke.execute(fn, frame, state, unresolved.args);
        return r;
      }
    }

    @Specialization(replaces = "instantiateCached")
    @CompilerDirectives.TruffleBoundary
    Object instantiateUncached(
        MaterializedFrame frame, State state, Type expectedType, UnresolvedConstructor unresolved) {
      var c = expectedType.getConstructors().get(unresolved.getName());
      if (c == null) {
        return null;
      }
      var fn = c.getConstructorFunction();
      var node = buildInvokeNode(unresolved);
      var r = node.execute(fn, frame, state, unresolved.args);
      return r;
    }
  }

  @ExportMessage
  boolean hasType() {
    return true;
  }

  @ExportMessage
  Type getType(@Bind("$node") Node node) {
    var ctx = EnsoContext.get(node);
    return ctx.getBuiltins().function();
  }
}
