/**
 * Shared diff utility for comparing text content
 */

export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  line: string;
}

/**
 * Simple diff function that compares two strings line by line
 * Uses a basic LCS-based approach
 */
export function computeDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const result: DiffLine[] = [];

  let i = 0;
  let j = 0;

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i >= originalLines.length) {
      result.push({ type: 'added', line: modifiedLines[j] });
      j++;
    } else if (j >= modifiedLines.length) {
      result.push({ type: 'removed', line: originalLines[i] });
      i++;
    } else if (originalLines[i] === modifiedLines[j]) {
      result.push({ type: 'same', line: originalLines[i] });
      i++;
      j++;
    } else {
      // Look ahead to see if we can find a match
      let foundInModified = modifiedLines.indexOf(originalLines[i], j);
      let foundInOriginal = originalLines.indexOf(modifiedLines[j], i);

      if (foundInModified === -1 && foundInOriginal === -1) {
        // Both lines are different
        result.push({ type: 'removed', line: originalLines[i] });
        result.push({ type: 'added', line: modifiedLines[j] });
        i++;
        j++;
      } else if (foundInModified !== -1 && (foundInOriginal === -1 || foundInModified - j < foundInOriginal - i)) {
        // Line was added in modified
        result.push({ type: 'added', line: modifiedLines[j] });
        j++;
      } else {
        // Line was removed from original
        result.push({ type: 'removed', line: originalLines[i] });
        i++;
      }
    }
  }

  return result;
}
