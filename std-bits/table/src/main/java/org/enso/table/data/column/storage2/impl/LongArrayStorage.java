package org.enso.table.data.column.storage2.impl;

import org.enso.table.data.column.storage.type.IntegerType;
import org.enso.table.data.column.storage.type.StorageType;
import org.enso.table.data.column.storage2.LongStorage;
import org.enso.table.data.column.storage2.TypedStorage;

import java.util.BitSet;

public class LongArrayStorage implements LongStorage {
  // TODO [RW] at some point we will want to add separate storage classes for byte, short and int,
  // for more compact storage and more efficient handling of smaller integers; for now we will be
  // handling this just by checking the bounds
  private final long[] data;
  private final BitSet isNothing;
  private final int size;

  private final IntegerType type;

  public LongArrayStorage(long[] data, int size, BitSet isNothing, IntegerType type) {
    this.data = data;
    this.isNothing = isNothing;
    this.size = size;
    this.type = type;
  }

  public LongArrayStorage(long[] data, IntegerType type) {
    this(data, data.length, new BitSet(), type);
  }

  /**
   * @inheritDoc
   */
  @Override
  public long size() {
    return size;
  }

  /**
   * @inheritDoc
   */
  @Override
  public long countNothing() {
    return isNothing.cardinality();
  }

  /**
   * @inheitDoc
   */
  @Override
  public long getLong(long idx) {
    return data[(int)idx];
  }

  /**
   * @inheritDoc
   */
  @Override
  public Long get(long idx) {
    if (idx > Integer.MAX_VALUE || idx < 0) {
      throw new IndexOutOfBoundsException();
    }
    return isNothing.get((int)idx) ? null : data[(int)idx];
  }

  /**
   * @inheritDoc
   */
  @Override
  public StorageType inferPreciseType() {
    return null;
  }

  /**
   * @inheritDoc
   */
  @Override
  public StorageType inferPreciseTypeShrunk() {
    return null;
  }

  @Override
  public TypedStorage<?> tryGettingMoreSpecializedStorage() {
    return null;
  }

  /**
   * @inheritDoc
   */
  @Override
  public IntegerType getType() {
    return type;
  }
}
