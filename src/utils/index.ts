export function areArraysEqualSets<T>(arr1: T[], arr2: T[]) {
  if (arr1.length !== arr2.length) return false;

  const uniqueElements = new Set([...arr1, ...arr2]);

  for (const item of uniqueElements) {
    if (
      arr1.filter((x) => x === item).length !==
      arr2.filter((x) => x === item).length
    ) {
      return false;
    }
  }

  return true;
}
