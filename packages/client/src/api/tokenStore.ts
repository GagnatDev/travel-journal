type RefreshFn = () => Promise<string>;

let _refreshFn: RefreshFn | null = null;
let _inflightRefresh: Promise<string> | null = null;

export function registerRefresh(fn: RefreshFn | null): void {
  _refreshFn = fn;
  if (!fn) _inflightRefresh = null;
}

export async function attemptRefresh(): Promise<string> {
  if (!_refreshFn) throw new Error('No refresh function registered');
  if (!_inflightRefresh) {
    _inflightRefresh = _refreshFn().finally(() => {
      _inflightRefresh = null;
    });
  }
  return _inflightRefresh;
}
