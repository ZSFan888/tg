export function sanitizeMarkdown(text: string): string {
  let result = text;

  result = result.replace(/^#{1,6}\s*/gm, '');
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result.replace(/__(.+?)__/g, '$1');
  result = result.replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1');
  result = result.replace(/(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, '$1');
  result = result.replace(/`([^`]+)`/g, '$1');
  result = result.replace(/^\s*[-*+]\s+/gm, '- ');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]+$/gm, '');

  return result.trim();
}
