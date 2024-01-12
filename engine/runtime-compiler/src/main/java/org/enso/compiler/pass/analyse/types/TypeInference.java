package org.enso.compiler.pass.analyse.types;

import org.enso.compiler.context.InlineContext;
import org.enso.compiler.context.ModuleContext;
import org.enso.compiler.core.ConstantsNames;
import org.enso.compiler.core.IR;
import org.enso.compiler.core.ir.Module;
import org.enso.compiler.core.ir.*;
import org.enso.compiler.core.ir.expression.Application;
import org.enso.compiler.core.ir.module.scope.definition.Method;
import org.enso.compiler.core.ir.type.Set;
import org.enso.compiler.data.BindingsMap;
import org.enso.compiler.pass.IRPass;
import org.enso.compiler.pass.analyse.AliasAnalysis;
import org.enso.compiler.pass.analyse.BindingAnalysis$;
import org.enso.compiler.pass.analyse.JavaInteropHelpers;
import org.enso.compiler.pass.resolve.GlobalNames$;
import org.enso.compiler.pass.resolve.TypeNames$;
import org.enso.compiler.pass.resolve.TypeSignatures;
import org.enso.compiler.pass.resolve.TypeSignatures$;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import scala.Option;
import scala.collection.immutable.Seq;
import scala.collection.immutable.Seq$;
import scala.jdk.javaapi.CollectionConverters;

import java.util.*;

public final class TypeInference implements IRPass {
  public static final TypeInference INSTANCE = new TypeInference();
  private UUID uuid;

  @Override
  public void org$enso$compiler$pass$IRPass$_setter_$key_$eq(UUID v) {
    this.uuid = v;
  }

  @Override
  public UUID key() {
    return uuid;
  }

  @Override
  public Seq<IRPass> precursorPasses() {
    List<IRPass> passes = List.of(
        BindingAnalysis$.MODULE$,
        TypeNames$.MODULE$,
        TypeSignatures$.MODULE$
    );
    return CollectionConverters.asScala(passes).toList();
  }

  @Override
  @SuppressWarnings("unchecked")
  public Seq<IRPass> invalidatedPasses() {
    return (Seq<IRPass>) Seq$.MODULE$.empty();
  }

  @Override
  public Module runModule(Module ir, ModuleContext moduleContext) {
    var ctx = new InlineContext(
        moduleContext,
        moduleContext.compilerConfig(),
        Option.empty(),
        Option.empty(),
        Option.empty(),
        Option.empty(),
        Option.empty()
    );

    log("TypeInference.runModule: " + moduleContext.getName());
    var mappedBindings = ir.bindings().map((def) -> {
      switch (def) {
        case Method.Explicit b -> {
          log("\ninside method " + b.methodReference().name());
        }
        default -> {
          log("\ndefinition " + def.getClass().getCanonicalName() + " - " + def.showCode());
        }
      }
      return def.mapExpressions(
          (expression) -> runExpression(expression, ctx)
      );
    });

    return ir.copy(ir.imports(), ir.exports(), mappedBindings, ir.location(), ir.passData(), ir.diagnostics(), ir.id());
  }

  @Override
  public Expression runExpression(Expression ir, InlineContext inlineContext) {
    return analyzeExpression(ir, inlineContext, LocalBindingsTyping.create());
  }

  private Expression analyzeExpression(Expression ir, InlineContext inlineContext, LocalBindingsTyping localBindingsTyping) {
    // We first run the inner expressions, as most basic inference is propagating types in a bottom-up manner.
    var mappedIr = ir.mapExpressions(
        (expression) -> analyzeExpression(expression, inlineContext, localBindingsTyping)
    );

    processTypePropagation(mappedIr, localBindingsTyping);

    // The ascriptions are processed later, because we want them to _overwrite_ any type that was inferred.
    processTypeAscription(mappedIr);

    var inferredType = getInferredType(mappedIr);
    if (inferredType != null) {
      log("inferred type", mappedIr, inferredType.type().toString());
    } else {
      log("inferred type", mappedIr, "NONE");
    }
    return mappedIr;
  }

  private void processTypeAscription(Expression ir) {
    Optional<TypeSignatures.Signature> ascribedSignature =
        getOptionalMetadata(ir, TypeSignatures$.MODULE$, TypeSignatures.Signature.class);
    if (ascribedSignature.isPresent()) {
      TypeSignatures.Signature s = ascribedSignature.get();
      log("type signature", ir, s.signature().showCode());
      TypeRepresentation ascribedType = resolveTypeExpression(s.signature());
      if (ascribedType != null) {
        var previouslyInferredType = getInferredType(ir);
        if (previouslyInferredType != null) {
          log("type signature", ir, "overwriting previously inferred type " + previouslyInferredType.type());
          // TODO in the future we could be checking for conflicts here and reporting a type error if the ascription and the inferred type are not compatible
        }

        setInferredType(ir, new InferredType(ascribedType));
      }
    }
  }

  private static class LocalBindingsTyping {
    private final Map<AliasAnalysis.Graph, Map<Integer, TypeRepresentation>> map = new HashMap<>();
    public static LocalBindingsTyping create() {
      return new LocalBindingsTyping();
    }

    private Map<Integer, TypeRepresentation> accessGraph(AliasAnalysis.Graph graph) {
      return map.computeIfAbsent(graph, (g) -> new HashMap<>());
    }

    TypeRepresentation getBindingType(AliasAnalysis.Graph graph, int id) {
      return accessGraph(graph).get(id);
    }

    void registerBindingType(AliasAnalysis.Graph graph, int id, TypeRepresentation type) {
      var previous = accessGraph(graph).put(id, type);
      if (previous != null) {
        throw new IllegalStateException("Duplicate binding " + id + " in graph " + graph);
      }
    }
  }

  private void processTypePropagation(Expression ir, LocalBindingsTyping localBindingsTyping) {
    switch (ir) {
      case Name.Literal l -> processName(l, localBindingsTyping);
      case Application.Force f -> {
        var innerType = getInferredType(f.target());
        if (innerType != null) {
          setInferredType(f, innerType);
        }
      }
      case Application.Prefix p -> {
        var functionType = getInferredType(p.function());
        if (functionType != null) {
          var inferredType = processApplication(functionType.type(), p.arguments(), p);
          if (inferredType != null) {
            setInferredType(p, new InferredType(inferredType));
          }
        }
      }
      case Expression.Binding b -> {
        var innerType = getInferredType(b.expression());
        if (innerType != null) {
          registerBinding(b, innerType.type(), localBindingsTyping);
        }
      }
      case Expression.Block b -> {
        var innerType = getInferredType(b.returnValue());
        if (innerType != null) {
          setInferredType(b, innerType);
        }
      }
      case Function.Lambda f -> {
        var type = buildLambdaType(f);
        if (type != null) {
          setInferredType(f, type);
        }
      }
      case Literal l -> processLiteral(l);
      case Application.Sequence sequence ->
        setInferredType(sequence, new InferredType(TypeRepresentation.VECTOR));
      default -> {
        log("type propagation", ir, "UNKNOWN: " + ir.getClass().getCanonicalName());
      }
    }
  }

  private void registerBinding(Expression.Binding binding, TypeRepresentation type, LocalBindingsTyping localBindingsTyping) {
    var metadata = JavaInteropHelpers.getAliasAnalysisOccurrenceMetadata(binding);
    var occurrence = metadata.graph().getOccurrence(metadata.id());
    if (occurrence.isEmpty()) {
      log("registerBinding", binding, "missing occurrence in graph for " + metadata);
      return;
    }

    var def = JavaInteropHelpers.occurrenceAsDef(occurrence.get());
    localBindingsTyping.registerBindingType(metadata.graph(), def.id(), type);
    log("registerBinding", binding, "registered " + def.id() + " as " + type);
  }

  private void processName(Name.Literal literalName, LocalBindingsTyping localBindingsTyping) {
    // This should reproduce IrToTruffle::processName logic
    var occurrenceMetadata = JavaInteropHelpers.getAliasAnalysisOccurrenceMetadata(literalName);
    Optional<BindingsMap.Resolution> global =
        getOptionalMetadata(literalName, GlobalNames$.MODULE$, BindingsMap.Resolution.class);
    var localLink = occurrenceMetadata.graph().defLinkFor(occurrenceMetadata.id());
    if (localLink.isDefined() && global.isPresent()) {
      log("processName", literalName, "BOTH DEFINED AND GLOBAL - WHAT TO DO HERE? " + occurrenceMetadata);
    }

    boolean isLocalReference = localLink.isDefined();
    if (isLocalReference) {
      int target = localLink.get().target();
      TypeRepresentation type = localBindingsTyping.getBindingType(occurrenceMetadata.graph(), target);
      log("processName", literalName, "local reference to " + target + " --> type: " + type);
      if (type != null) {
        setInferredType(literalName, new InferredType(type));
      }
    } else if (global.isPresent()) {
      BindingsMap.ResolvedName resolution = global.get().target();
      processGlobalName(literalName, resolution);
    } else if (literalName.name().equals(ConstantsNames.FROM_MEMBER)) {
      log("processName", literalName, "from conversion - currently unsupported");
    } else {
      var type = new TypeRepresentation.UnresolvedSymbol(literalName.name());
      setInferredType(literalName, new InferredType(type));
    }
  }

  private void processGlobalName(Name.Literal literalName, BindingsMap.ResolvedName resolution) {
    switch (resolution) {
      case BindingsMap.ResolvedConstructor ctor -> {
        // TODO when do these appear??
        log("processGlobalName", literalName, "RESOLVED CONTRUCTOR");

        var constructorFunctionType = buildAtomConstructorType(resolvedTypeAsTypeObject(ctor.tpe()), ctor.cons());
        if (constructorFunctionType != null) {
          setInferredType(literalName, new InferredType(constructorFunctionType));
        }
      }

      case BindingsMap.ResolvedType tpe -> {
        var type = resolvedTypeAsTypeObject(tpe);
        setInferredType(literalName, new InferredType(type));
      }
      default ->
          log("processGlobalName", literalName, "global scope reference to " + resolution + " - currently global inference is unsupported");
    }
  }

  private TypeRepresentation.TypeObject resolvedTypeAsTypeObject(BindingsMap.ResolvedType resolvedType) {
    return new TypeRepresentation.TypeObject(resolvedType.qualifiedName(), resolvedType.tp());
  }

  private void processLiteral(Literal literal) {
    TypeRepresentation type = switch (literal) {
      case Literal.Number number -> number.isFractional() ? TypeRepresentation.FLOAT : TypeRepresentation.INTEGER;
      case Literal.Text text -> TypeRepresentation.TEXT;
      // This branch is needed only because Java is unable to infer that the match is exhaustive
      default ->
          throw new IllegalStateException("Impossible - unknown literal type: " + literal.getClass().getCanonicalName());
    };
    setInferredType(literal, new InferredType(type));
  }

  @SuppressWarnings("unchecked")
  private TypeRepresentation processApplication(TypeRepresentation functionType, scala.collection.immutable.List<CallArgument> arguments, Application.Prefix relatedIR) {
    if (arguments.isEmpty()) {
      log("WARNING processApplication", relatedIR, "unexpected - no arguments in a function application");
      return functionType;
    }

    var firstArgument = arguments.head();
    var firstResult = processSingleApplication(functionType, firstArgument, relatedIR);
    if (firstResult == null) {
      return null;
    }

    if (arguments.length() == 1) {
      return firstResult;
    } else {
      return processApplication(firstResult, (scala.collection.immutable.List<CallArgument>) arguments.tail(), relatedIR);
    }
  }

  private TypeRepresentation processSingleApplication(TypeRepresentation functionType, CallArgument argument, Application.Prefix relatedIR) {
    if (argument.name().isDefined()) {
      log("processSingleApplication: " + argument + " - named arguments are not yet supported");
      return null;
    }

    switch (functionType) {
      case TypeRepresentation.ArrowType arrowType -> {
        // TODO we could check the argument type and emit warnings if it does not match the expected one
        return arrowType.resultType();
      }

      case TypeRepresentation.UnresolvedSymbol unresolvedSymbol -> {
        return processUnresolvedSymbolApplication(unresolvedSymbol, argument.value());
      }

      case TypeRepresentation.TopType() -> {
        // we ignore this branch - Any type can be whatever, it could be a function, so we cannot emit a 'guaranteed' error
      }

      default -> {
        log("type propagation: Expected a function type but got: " + functionType);
        relatedIR.diagnostics().add(new Warning.NotInvokable(relatedIR.location(), functionType.toString()));
      }
    }

    return null;
  }

  private TypeRepresentation processUnresolvedSymbolApplication(TypeRepresentation.UnresolvedSymbol function, Expression argument) {
    var argumentType = getInferredType(argument);
    if (argumentType == null) {
      return null;
    }

    switch (argumentType.type()) {
      case TypeRepresentation.TypeObject typeObject -> {
        Option<BindingsMap.Cons> ctorCandidate = typeObject.shape().members().find((ctor) -> ctor.name().equals(function.name()));
        if (ctorCandidate.isDefined()) {
          return buildAtomConstructorType(typeObject, ctorCandidate.get());
        } else {
          // TODO if no ctor found, we should search static methods, but that is not implemented currently; so we cannot report an error either - just do nothing
          return null;
        }
      }

      default -> {
        log("processing " + function + " application on " + argumentType.type() + " - currently unsupported");
        return null;
      }
    }
  }

  private TypeRepresentation buildAtomConstructorType(TypeRepresentation.TypeObject parentType, BindingsMap.Cons constructor) {
    if (constructor.anyFieldsDefaulted()) {
      // TODO implement handling of default arguments - not only ctors will need this!
      log("buildAtomConstructorType(" + parentType.name() + ", " + constructor.name() + "): constructors with default arguments are not supported yet.");
      return null;
    }

    var arguments = constructor.arguments().map((arg) -> arg.typ().map(this::resolveTypeExpression).getOrElse(() -> TypeRepresentation.UNKNOWN));
    var resultType = parentType.instantiate();
    return TypeRepresentation.buildFunction(CollectionConverters.asJava(arguments), resultType);
  }

  /**
   * Builds the type of a lambda, based on available type information of its parts.
   * <p>
   * The return type is inferred based on the body, and expected argument types are based on type ascriptions of these
   * arguments (currently no upwards propagation of constraints yet). Even if the types are not known, we may fall back
   * to a default unknown type, but we may at least infer the minimum arity of the function.
   */
  private InferredType buildLambdaType(Function.Lambda f) {
    scala.collection.immutable.List<TypeRepresentation> argTypesScala =
        f.arguments()
            .filter((arg) -> !(arg.name() instanceof Name.Self))
            .map((arg) -> {
                  if (arg.ascribedType().isDefined()) {
                    Expression t = arg.ascribedType().get();
                    return resolveTypeExpression(t);
                  } else {
                    return TypeRepresentation.UNKNOWN;
                  }
                }
            );

    InferredType inferredReturnType = getInferredType(f.body());

    if (inferredReturnType == null && argTypesScala.isEmpty()) {
      // If the return type is unknown and we have no arguments, we do not infer anything useful - so we withdraw.
      return null;
    }

    TypeRepresentation returnType =
        inferredReturnType == null ? TypeRepresentation.ANY : inferredReturnType.type();

    TypeRepresentation arrowType = TypeRepresentation.buildFunction(
        CollectionConverters.asJava(argTypesScala),
        returnType
    );
    return new InferredType(arrowType);
  }

  private void setInferredType(Expression expression, InferredType type) {
    Objects.requireNonNull(type, "type must not be null");
    expression.passData().update(this, type);
  }

  private InferredType getInferredType(Expression expression) {
    Option<ProcessingPass.Metadata> r = expression.passData().get(this);
    if (r.isDefined()) {
      return (InferredType) r.get();
    } else {
      return null;
    }
  }

  private TypeRepresentation resolveTypeExpression(Expression type) {
    return switch (type) {
      case Name.Literal name -> {
        Optional<BindingsMap.Resolution> resolutionOptional =
            getOptionalMetadata(name, TypeNames$.MODULE$, BindingsMap.Resolution.class);
        if (resolutionOptional.isPresent()) {
          BindingsMap.ResolvedName target = resolutionOptional.get().target();
          yield TypeRepresentation.fromQualifiedName(target.qualifiedName());
        } else {
          log("resolveTypeExpression", type, "Missing TypeName resolution metadata");
          yield TypeRepresentation.UNKNOWN;
        }
      }

      case Set.Union union -> {
        var operands = union.operands().map(this::resolveTypeExpression);
        yield new TypeRepresentation.SumType(CollectionConverters.asJava(operands));
      }

      case Set.Intersection intersection -> {
        var lhs = resolveTypeExpression(intersection.left());
        var rhs = resolveTypeExpression(intersection.right());
        yield new TypeRepresentation.IntersectionType(List.of(lhs, rhs));
      }

      // We could extract more info form function, but we deliberately do not.
      // This is because our ascriptions (x : A -> B) only check (x.is_a Function), so all we get is that it is a
      // function with at least one argument (and we can't even tell its full arity).
      // Later, we could extract this as some kind of secondary metadata, but currently we do not because it could be
      // misleading - this property is _not_ guaranteed at runtime as other ascriptions are. Functions not matching
      // this type will still be allowed. That's why we return the more generic type that covers everything that the
      // check actually lets through.
      case Type.Function function -> new TypeRepresentation.ArrowType(
          TypeRepresentation.UNKNOWN,
          TypeRepresentation.ANY
      );

      // We just ignore the error part for now as it's not really checked anywhere.
      case Type.Error error -> resolveTypeExpression(error.typed());

      default -> {
        log("resolveTypeExpression", type, "UNKNOWN BRANCH");
        yield TypeRepresentation.UNKNOWN;
      }
    };
  }

  private <T> Optional<T> getOptionalMetadata(IR ir, IRPass pass, Class<T> expectedType) {
    Option<ProcessingPass.Metadata> option = ir.passData().get(pass);
    if (option.isDefined()) {
      try {
        return Optional.of(expectedType.cast(option.get()));
      } catch (ClassCastException exception) {
        throw new IllegalStateException("Unexpected metadata type " + option.get().getClass().getCanonicalName() + " " +
            "for " + pass, exception);
      }
    } else {
      return Optional.empty();
    }
  }

  private <T> T getMetadata(IR ir, IRPass pass, Class<T> expectedType) {
    Optional<T> optional = getOptionalMetadata(ir, pass, expectedType);
    if (optional.isEmpty()) {
      throw new IllegalStateException("Missing expected " + pass + " metadata for " + ir + ".");
    }

    return optional.get();
  }

  private void log(String prefix, Expression expression, String suffix) {
    String name = expression.getClass().getCanonicalName();
    name = name.substring(name.indexOf("ir.") + 3);

    String suffixStr = suffix == null ? "" : " ==> " + suffix;
    log(prefix + ": " + name + " - " + expression.showCode() + suffixStr);
  }

  private void log(String message) {
    if (logToStdOut) {
      System.out.println(message);
    } else {
      logger.trace(message);
    }
  }

  private static final Logger logger = LoggerFactory.getLogger(TypeInference.class);

  // FIXME this is a temporary simplification, because regular logs seem to not be displayed in tests
  private static final boolean logToStdOut = true;
}