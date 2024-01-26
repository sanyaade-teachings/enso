package org.enso.table.data.column.storage2;

import org.enso.table.data.column.storage.type.StorageType;

//** Interface storage for generic values. */
public interface TypedStorage<T> {
  /**
   * @return the number of elements in this storage.
   */
  long size();

  /**
   * @return the number of Nothing elements in this storage.
   */
  long countNothing();

  /**
   * @return the type of the values in this storage.
   */
  StorageType getType();

  /**
   * @return true if the element at the given index is Nothing.
   */
  boolean isNothing(long index);

  /**
   * @return the element at the given index.
   * For primitives this will be the boxed value.
   * Use the interface specific methods to get the primitive value.
   */
  T get(long index);

  /**
   * @return the type of the values in this column's storage. Most storages just return their type.
   *     Mixed storage will try to see if all elements fit some more precise type.
   */
  StorageType inferPreciseType();

  /**
   * Returns the smallest type (according to Column.auto_value_type rules) that may still fit all
   * values in this column.
   *
   * <p>It is a sibling of `inferPreciseType` that allows some further shrinking. It is kept
   * separate, because `inferPreciseType` should be quick to compute (cached if needed) as it is
   * used in typechecking of lots of operations. This one however, is only used in a specific
   * `auto_value_type` use-case and rarely will need to be computed more than once.
   */
  StorageType inferPreciseTypeShrunk();

  /**
   * Returns a more specialized storage, if available.
   * This storage should have the same type as returned by {@code inferPreciseType}.
   */
  TypedStorage<?> tryGettingMoreSpecializedStorage();
}

