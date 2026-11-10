/** Zod 3 schema option for a missing value. */
export const requiredError = (message: string) => ({ required_error: message });

/** Zod 3 schema option for a value of the wrong type. */
export const invalidTypeError = (message: string) => ({ invalid_type_error: message });
