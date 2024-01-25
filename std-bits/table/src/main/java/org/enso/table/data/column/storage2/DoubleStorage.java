package org.enso.table.data.column.storage2;

public interface DoubleStorage extends TypedStorage<Double> {
  double getDouble(long index);
}
