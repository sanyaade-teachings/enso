package org.enso.table.data.column.storage2;

import org.enso.table.data.column.storage.type.IntegerType;
import org.enso.table.data.column.storage2.impl.LongArrayStorage;

import java.util.BitSet;

public interface LongStorage extends TypedStorage<Long> {
  long getLong(long index);

  static LongStorage fromArray(long[] data) {
    return new LongArrayStorage(data, data.length, new BitSet(), IntegerType.INT_64);
  }

  static LongStorage empty() {
    return new LongArrayStorage(new long[0], 0, new BitSet(), IntegerType.INT_64);
  }
}
