const appPath =
  /^\/(?:dashboard(?:\/financial)?|accounting|banking|reports|more|prices|products|menus|receiving|receipts(?:\/[^/]+)?|schedules(?:\/[^/]+)?|rooms\/[^/]+)\/?$/;

// Only app routes may be used as a destination after authentication.
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\u0000-\u0020]/.test(value))
    return '/dashboard';
  try {
    const url = new URL(value, 'https://zcfnb.invalid');
    const decoded = decodeURIComponent(url.pathname);
    if (
      url.origin !== 'https://zcfnb.invalid' ||
      /[\\\u0000-\u001f]/.test(decoded) ||
      !appPath.test(decoded)
    )
      return '/dashboard';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}

export function confirmDiscard(dirty: boolean, busy = false) {
  return (
    !busy &&
    (!dirty || window.confirm('저장·전송하지 않은 내용이 있습니다. 내용을 버리고 이동할까요?'))
  );
}
