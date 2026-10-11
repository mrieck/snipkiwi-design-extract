import { CDPSession } from 'patchright';
import { ViewportConfig, DEFAULT_VIEWPORTS } from '../types/index.js';

export class ViewportManager {
  async setViewport(cdp: CDPSession, viewport: ViewportConfig): Promise<void> {
    const params: any = {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
      mobile: viewport.mobile || false,
    };

    await cdp.send('Emulation.setDeviceMetricsOverride', params);

    if (viewport.userAgent) {
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent: viewport.userAgent,
      });
      await cdp.send('Network.setUserAgentOverride', {
        userAgent: viewport.userAgent,
      });
    }
  }

  async clearViewport(cdp: CDPSession): Promise<void> {
    await cdp.send('Emulation.clearDeviceMetricsOverride');
  }

  getViewportsForOption(option: string, customWidth?: number): ViewportConfig[] {
    switch (option) {
      case 'desktop':
        return [DEFAULT_VIEWPORTS.default];
      case 'tablet':
        return [DEFAULT_VIEWPORTS.ipad];
      case 'mobile':
        return [DEFAULT_VIEWPORTS.iphonexs];
      case 'all':
        return [
          DEFAULT_VIEWPORTS.default,
          DEFAULT_VIEWPORTS.iphonexs,
          DEFAULT_VIEWPORTS.ipad,
          DEFAULT_VIEWPORTS.ipadlandscape,
        ];
      case 'responsive':
        // Faster 3-pass sample: desktop + tablet(md) + mobile. Drops the 1024
        // 'ipadlandscape' pass, which is largely redundant with desktop for
        // min-width frameworks — but NOT lossless (rules gated to a ~992-1199px
        // band, e.g. Bootstrap lg-only, fire only near 1024). Use 'all' for max
        // fidelity; 'responsive' trades that edge for ~25% less work.
        return [
          DEFAULT_VIEWPORTS.default,
          DEFAULT_VIEWPORTS.ipad,
          DEFAULT_VIEWPORTS.iphonexs,
        ];
      default:
        if (customWidth) {
          return [{
            name: `custom-${customWidth}`,
            width: customWidth,
            height: 768,
          }];
        }
        return [DEFAULT_VIEWPORTS.default];
    }
  }
}
