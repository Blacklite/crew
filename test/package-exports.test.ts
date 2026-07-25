import { describe, it, expect } from 'vitest';

describe('SDK package exports', () => {
  it('exports VERSION from root', async () => {
    const sdk = await import('@blacklite/crew-sdk');
    expect(sdk.VERSION).toBeDefined();
    expect(typeof sdk.VERSION).toBe('string');
  });

  it('exports from /config subpath', async () => {
    const config = await import('@blacklite/crew-sdk/config');
    expect(config).toBeDefined();
    // config barrel re-exports schema, routing, models, etc.
    expect(config.DEFAULT_CONFIG).toBeDefined();
  });

  it('exports from /resolution subpath', async () => {
    const resolution = await import('@blacklite/crew-sdk/resolution');
    expect(resolution.resolveCrew).toBeDefined();
  });

  it('exports from /parsers subpath', async () => {
    const parsers = await import('@blacklite/crew-sdk/parsers');
    expect(parsers).toBeDefined();
    expect(parsers.parseTeamMarkdown).toBeDefined();
  });

  it('exports from /types subpath', async () => {
    // types subpath uses export type only — no runtime values
    // just verify the module resolves without error
    const types = await import('@blacklite/crew-sdk/types');
    expect(types).toBeDefined();
  });

  it('exports from /agents subpath', async () => {
    const agents = await import('@blacklite/crew-sdk/agents');
    expect(agents).toBeDefined();
  });

  it('exports from /skills subpath', async () => {
    const skills = await import('@blacklite/crew-sdk/skills');
    expect(skills).toBeDefined();
  });

  it('exports from /tools subpath', async () => {
    const tools = await import('@blacklite/crew-sdk/tools');
    expect(tools).toBeDefined();
  });
});
