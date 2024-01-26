package org.enso.table.data.column.operators;

import org.enso.table.data.column.storage2.TypedStorage;

//** An operator that can be applied to a column. */
public interface Operator {
  //** The name of the operator. */
  String name();

  //** The number of arguments for a given operator. */
  int arity();

  //** Can the operator support the operation on the given storage. */
  boolean supports(TypedStorage<?> column, Object[] args);
}
