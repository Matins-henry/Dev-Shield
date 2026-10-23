export interface ProxyTargetResolution {
  upstreamUrl: string;
  targetPath: string;
  routeId: string;
}

export interface ProxyDispatchResult {
  statusCode: number;
  durationMs: number;
}
