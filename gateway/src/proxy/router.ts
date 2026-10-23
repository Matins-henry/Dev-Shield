import { RouteConfig } from '../config/routes.js';
import { ProxyTargetResolution } from './types.js';

export class ProxyRouter {
  private routes: RouteConfig[];

  public constructor(initialRoutes: RouteConfig[]) {
    // Sort routes by prefix length descending so more specific prefixes match first
    this.routes = [...initialRoutes].sort(
      (a, b) => b.pathPrefix.length - a.pathPrefix.length
    );
  }

  public setRoutes(routes: RouteConfig[]): void {
    this.routes = [...routes].sort(
      (a, b) => b.pathPrefix.length - a.pathPrefix.length
    );
  }

  public getRoutes(): RouteConfig[] {
    return [...this.routes];
  }

  public match(pathname: string): { route: RouteConfig; target: ProxyTargetResolution } | null {
    for (const route of this.routes) {
      if (pathname === route.pathPrefix || pathname.startsWith(route.pathPrefix + '/')) {
        let targetPath = pathname;
        if (route.stripPrefix) {
          targetPath = pathname.slice(route.pathPrefix.length);
          if (!targetPath.startsWith('/')) {
            targetPath = '/' + targetPath;
          }
        }

        return {
          route,
          target: {
            upstreamUrl: route.upstreamUrl,
            targetPath,
            routeId: route.id,
          },
        };
      }
    }

    return null;
  }
}
