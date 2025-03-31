/**
 * Formats a number to display appropriate decimal places:
 * - Shows all decimal places for very small numbers (0.000000...)
 * - Removes trailing zeros for other numbers
 * 
 * @param value The number to format
 * @param defaultPrecision Default precision to use for regular numbers
 * @returns Formatted number as a string
 */
export function formatDecimal(value: number, defaultPrecision: number = 2): string {
  if (value === 0) return '0';
  
  // Convert to string with high precision to capture very small numbers
  const stringValue = value.toFixed(10);
  
  // Check if this is a very small number (close to zero but not zero)
  if (Math.abs(value) < 0.0001 && value !== 0) {
    // For very small numbers, keep all significant digits
    // Remove trailing zeros after the last non-zero digit
    return stringValue.replace(/\.?0+$/, '');
  }
  
  // For regular numbers, use the default precision but remove trailing zeros
  const regularFormat = value.toFixed(defaultPrecision);
  
  // Remove trailing zeros after the decimal point
  // If all digits after decimal are zeros, remove the decimal point too
  return regularFormat.replace(/\.?0+$/, '');
}