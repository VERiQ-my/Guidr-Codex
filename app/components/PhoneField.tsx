"use client";

/**
 * Reusable phone input with a searchable country picker.
 *
 * Wraps `react-phone-number-input`:
 *  - `value` / `onChange` use E.164 (e.g. "+60123456789") or undefined when empty.
 *  - Country list is browser-native, so users can type a letter to jump to it.
 *  - Validation is intentionally NOT done here — the consumer decides when to
 *    validate (usually on submit) using `isValidPhoneNumber` from this module.
 */

import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import type { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";

/** E.164-formatted phone number, e.g. "+60123456789". Branded as a string at runtime. */
export type E164Number = string;

export { isValidPhoneNumber };

interface PhoneFieldProps {
  value: E164Number | undefined;
  onChange: (value: E164Number | undefined) => void;
  defaultCountry?: Country;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function PhoneField({
  value,
  onChange,
  defaultCountry = "MY",
  placeholder = "Phone number",
  error = false,
  disabled = false,
  className = "",
}: PhoneFieldProps) {
  return (
    <PhoneInput
      international
      countryCallingCodeEditable={false}
      defaultCountry={defaultCountry}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`guidr-phone-input ${error ? "guidr-phone-input--error" : ""} ${className}`}
    />
  );
}
