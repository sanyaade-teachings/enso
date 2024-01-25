package org.enso.table.data.column.storage2;

public interface BooleanStorage extends TypedStorage<Boolean> {
  boolean getBoolean(long index);
}
