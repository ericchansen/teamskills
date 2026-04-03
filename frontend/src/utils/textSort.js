const textCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

export function compareText(a = '', b = '') {
  return textCollator.compare(String(a), String(b));
}
