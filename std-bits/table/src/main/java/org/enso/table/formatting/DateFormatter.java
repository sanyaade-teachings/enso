package org.enso.table.formatting;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public class DateFormatter implements DataFormatter {
  private final DateTimeFormatter formatter;

  public DateFormatter(String formatString, Locale locale) {
    formatter = DateTimeFormatter.ofPattern(formatString, locale);
  }

  @Override
  public String format(Object value) {
    if (value == null) {
      return NULL_REPRESENTATION;
    }

    if (value instanceof LocalDate date) {
      return date.format(formatter);
    }

    throw new IllegalArgumentException("Unsupported type for DateFormatter.");
  }

  @Override
  public boolean canFormat(Object value) {
    return value instanceof LocalDate;
  }
}
