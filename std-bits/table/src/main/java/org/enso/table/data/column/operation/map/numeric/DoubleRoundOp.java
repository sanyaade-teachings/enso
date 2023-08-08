package org.enso.table.data.column.operation.map.numeric;

import org.enso.polyglot.common_utils.Core_Math_Utils;
import org.enso.table.data.column.operation.map.TernaryMapOperation;
import org.enso.table.data.column.operation.map.MapOperationProblemBuilder;
import org.enso.table.data.column.storage.numeric.DoubleStorage;
import org.enso.table.data.column.storage.numeric.LongStorage;
import org.enso.table.data.column.storage.Storage;
import org.enso.table.error.UnexpectedTypeException;
import org.graalvm.polyglot.Context;

import java.util.BitSet;

/** An operation rounding floating-point numbers. */
public class DoubleRoundOp extends TernaryMapOperation<Double, DoubleStorage> {

    public DoubleRoundOp(String name) {
        super(name);
    }

    @Override
    public Storage<?> runTernaryMap(DoubleStorage storage, Object decimalPlacesObject, Object useBankersObject, MapOperationProblemBuilder problemBuilder) {
        if (decimalPlacesObject == null || useBankersObject == null) {
            return DoubleStorage.makeEmpty(storage.size());
        }

        if (!(decimalPlacesObject instanceof Long decimalPlaces)) {
            throw new UnexpectedTypeException("a long.");
        }
        if (!(useBankersObject instanceof Boolean useBankers)) {
            throw new UnexpectedTypeException("a boolean.");
        }

        Context context = Context.getCurrent();

        if (decimalPlaces <= 0) {
            // Return Long storage
            long[] out = new long[storage.size()];
            BitSet isMissing = new BitSet();

            for (int i = 0; i < storage.size(); i++) {
                if (!storage.isNa(i)) {
                    double item = storage.getItem(i);
                    boolean special = Double.isNaN(item) || Double.isInfinite(item);
                    if (!special) {
                        out[i] = (long) Core_Math_Utils.roundDouble(item, decimalPlaces, useBankers);
                    } else {
                        String msg = "Value is " + item;
                        problemBuilder.reportArithmeticError(msg, i);
                        isMissing.set(i);
                    }
                } else {
                    isMissing.set(i);
                }

                context.safepoint();
            }
            return new LongStorage(out, storage.size(), isMissing);
        } else {
            // Return double storage.
            long[] out = new long[storage.size()];
            BitSet isMissing = new BitSet();

            for (int i = 0; i < storage.size(); i++) {
                if (!storage.isNa(i)) {
                    double item = storage.getItem(i);
                    boolean special = Double.isNaN(item) || Double.isInfinite(item);
                    if (!special) {
                        out[i] = Double.doubleToRawLongBits(Core_Math_Utils.roundDouble(item, decimalPlaces, useBankers));
                    } else {
                        String msg = "Value is " + item;
                        problemBuilder.reportArithmeticError(msg, i);
                        isMissing.set(i);
                    }
                } else {
                    isMissing.set(i);
                }

                context.safepoint();
            }
            return new DoubleStorage(out, storage.size(), isMissing);
        }
    }
}