export function relativeTime(date: Date | null): string {
  if (!date) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  const seconds = diffInSeconds;
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return 'just now';
  } else if (minutes === 1) {
    return '1m ago';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours === 1) {
    return '1h ago';
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else if (days === 1) {
    return '1d ago';
  } else if (days < 30) {
    return `${days}d ago`;
  } else if (months === 1) {
    return '1mo ago';
  } else if (months < 12) {
    return `${months}mo ago`;
  } else if (years === 1) {
    return '1y ago';
  } else {
    return `${years}y ago`;
  }
}
