package org.enso.table.data.column.operators;

import org.enso.table.data.column.storage2.LongStorage;
import org.enso.table.data.column.storage2.TypedStorage;

public class AddOperator implements Operator {

  private static final String NAME = "add";

  //** Singleton operator instance. */
  public static final AddOperator INSTANCE = new AddOperator();

  private AddOperator() {}

  @Override
  public String name() {
    return NAME;
  }

  @Override
  public int arity() {
    return 2;
  }

  @Override
  public boolean supports(TypedStorage<?> column, Object[] args) {
    if (args.length != 1) {
      return false;
    }

    if (column instanceof LongStorage) {
      return true;
    } else if (column instanceof DoubleStorage) {
      return args[0] instanceof Double && args[1] instanceof Double;
    } else if (column instanceof BooleanStorage) {
      return args[0] instanceof Boolean && args[1] instanceof Boolean;
    } else {
      return false;
    }
  }
}
