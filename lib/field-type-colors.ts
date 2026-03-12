export const TYPE_COLOURS: Record<string, string> = {
  Symbol: 'bg-blue-100 text-blue-700',
  Text: 'bg-blue-100 text-blue-700',
  RichText: 'bg-purple-100 text-purple-700',
  Integer: 'bg-orange-100 text-orange-700',
  Number: 'bg-orange-100 text-orange-700',
  Boolean: 'bg-yellow-100 text-yellow-700',
  Date: 'bg-teal-100 text-teal-700',
  Link: 'bg-pink-100 text-pink-700',
  Array: 'bg-indigo-100 text-indigo-700',
  Object: 'bg-gray-100 text-gray-600',
  Location: 'bg-green-100 text-green-700',
};

export function typeBadgeClass(type: string): string {
  return TYPE_COLOURS[type] ?? 'bg-gray-100 text-gray-600';
}
