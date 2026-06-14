export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;

  // Brazilian default formatting when country code is present
  if (digits.startsWith('55') && digits.length >= 12) {
    const country = '+55';
    const area = digits.slice(2, 4);
    const local = digits.slice(4);
    if (local.length >= 9) {
      return `${country} (${area}) ${local.slice(0, 5)}-${local.slice(5, 9)}`;
    }
    return `${country} (${area}) ${local}`;
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length > 0) {
    return `+${digits}`;
  }

  return value;
};
