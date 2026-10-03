import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const gameDirectory = path.join(
  process.cwd(),
  'public',
  'games',
  'cradles-of-civilization',
);

describe('Cunabula Civilitatis public build', () => {
  it('contains the complete browser runtime', () => {
    for (const filename of [
      'index.html',
      'legacy.html',
      'release.json',
      'ending.html',
      'styles.css',
      'localization.js',
      'game.js',
      'balance-model.js',
      'endings.js',
      'map-lab/index.html',
      'map-lab/map-data.js',
      'map-lab/map-generator.js',
      'map-lab/map-model.js',
      'map-lab/map-lab.js',
      'map-lab/map-lab.css',
      'assets/governor-east-asian-man.png',
      'assets/governor-white-woman.png',
      'assets/governor-black-man.png',
      'assets/governor-trisolaran-listener.png',
    ]) {
      expect(fs.existsSync(path.join(gameDirectory, filename)), filename).toBe(true);
    }
  });

  it('publishes every local page dependency under the game path', () => {
    const origin = 'https://techecho.org';
    const basePath = '/games/cradles-of-civilization/';
    for (const filename of [
      'index.html',
      'legacy.html',
      'ending.html',
      'map-lab/index.html',
    ]) {
      const html = fs.readFileSync(path.join(gameDirectory, filename), 'utf8');
      const pageUrl = new URL(basePath + filename, origin);
      for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const reference = match[1];
        if (/^(?:https?:|data:|#)/.test(reference)) continue;
        const assetUrl = new URL(reference, pageUrl);
        expect(assetUrl.pathname.startsWith(basePath), reference).toBe(true);
        const assetPath = assetUrl.pathname.slice(basePath.length);
        expect(fs.existsSync(path.join(gameDirectory, assetPath)), reference).toBe(true);
      }
    }
  });

  it('publishes the React entrypoint with complete lazy chunks and original artwork', () => {
    const html = fs.readFileSync(path.join(gameDirectory, 'index.html'), 'utf8');
    expect(html).toContain('CUNABULA CIVILITATIS');
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/type="module"[^>]+src="\.\/assets\/index-[^"/]+\.js"/);
    expect(html).not.toContain('src="game.js');
    const assets = fs.readdirSync(path.join(gameDirectory, 'assets'));
    for (const prefix of ['App-', 'EndingPage-', 'DemoApp-', 'runtime-', 'game-']) {
      expect(
        assets.some((name) => name.startsWith(prefix) && name.endsWith('.js')),
        prefix,
      ).toBe(true);
    }
    for (const filename of assets.filter((name) => name.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(gameDirectory, 'assets', filename), 'utf8');
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\()?"(\.\/[^"?#]+\.(?:js|css))"/g,
      )) {
        expect(
          fs.existsSync(path.resolve(gameDirectory, 'assets', match[1])),
          `${filename}: ${match[1]}`,
        ).toBe(true);
      }
    }
    for (const artwork of [
      'egypt.webp',
      'mesopotamia.webp',
      'indus.webp',
      'yellow-river.webp',
    ]) {
      expect(fs.existsSync(path.join(gameDirectory, 'art', artwork)), artwork).toBe(true);
    }
  });

  it('matches the clean, versioned game source and release file inventory', () => {
    const release = JSON.parse(
      fs.readFileSync(path.join(gameDirectory, 'release.json'), 'utf8'),
    );
    expect(release.title).toBe('Cunabula Civilitatis');
    expect(release.version).toBe('0.5.0-alpha.4');
    expect(release.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(release.sourceDirty).toBe(false);
    expect(release.saveVersion).toBe(11);
    expect(release.entries).toMatchObject({ game: 'index.html', legacy: 'legacy.html' });
    expect(release.files.length).toBeGreaterThan(40);
    for (const file of release.files) {
      const contents = fs.readFileSync(path.join(gameDirectory, file.path));
      expect(contents.length, file.path).toBe(file.bytes);
      expect(createHash('sha256').update(contents).digest('hex'), file.path).toBe(
        file.sha256,
      );
    }
  });

  it('loads the shared 64-province geography before its consumers', () => {
    const scriptsIn = (filename: string) =>
      Array.from(
        fs
          .readFileSync(path.join(gameDirectory, filename), 'utf8')
          .matchAll(/<script\s+src="([^"?]+)(?:\?[^"]*)?"/g),
        (match) => match[1],
      );
    expect(scriptsIn('legacy.html')).toEqual([
      'map-lab/map-data.js',
      'localization.js',
      'endings.js',
      'balance-model.js',
      'map-lab/map-model.js',
      'map-lab/map-generator.js',
      'game.js',
    ]);
    expect(scriptsIn('ending.html')).toEqual([
      'map-lab/map-data.js',
      'localization.js',
      'endings.js',
    ]);
    const context = vm.createContext({});
    vm.runInContext(
      fs.readFileSync(path.join(gameDirectory, 'map-lab/map-data.js'), 'utf8'),
      context,
    );
    expect(context.CRADLES_MAP_LAB_DATA.provinces).toHaveLength(64);
    expect(context.CRADLES_MAP_LAB_DATA.strategicRegions).toHaveLength(10);
  });

  it('preserves the original actions and language-specific ending presentation', () => {
    const index = fs.readFileSync(path.join(gameDirectory, 'legacy.html'), 'utf8');
    const ending = fs.readFileSync(path.join(gameDirectory, 'ending.html'), 'utf8');
    const game = fs.readFileSync(path.join(gameDirectory, 'game.js'), 'utf8');
    expect(index.match(/data-action="/g)).toHaveLength(21);
    expect(ending).toMatch(/endingTitleLines = I18N\.isEnglish\(\)\s*\? \[endingNameEn\]/);
    expect(ending).toContain('[endingNameZh, endingNameEn]');
    expect(ending).toContain(
      'url.searchParams.set("lang", I18N.isEnglish() ? "en" : "zh")',
    );
    expect(game).toContain('url.searchParams.set("lang", I18N.isEnglish() ? "en" : "zh")');
    expect(index).toContain('20260913-cunae-civilitatis');
    expect(index).toContain('src="game.js?v=20260913-cunae-civilitatis"');
    expect(ending).toContain('20260913-cunae-civilitatis');
    expect(index).toContain('href="https://techecho.org/"');
    expect(ending).toContain('href="https://techecho.org/"');
  });

  it('keeps navigation and assets inside the published subdirectory', () => {
    const index = fs.readFileSync(path.join(gameDirectory, 'legacy.html'), 'utf8');
    const ending = fs.readFileSync(path.join(gameDirectory, 'ending.html'), 'utf8');
    const game = fs.readFileSync(path.join(gameDirectory, 'game.js'), 'utf8');
    const localization = fs.readFileSync(
      path.join(gameDirectory, 'localization.js'),
      'utf8',
    );
    const endings = fs.readFileSync(path.join(gameDirectory, 'endings.js'), 'utf8');

    expect(index).toContain('Cunae Civilitatis');
    expect(localization).toContain('Cunae Civilitatis');
    expect(index).toContain('href="styles.css');
    expect(index).toContain('id="languageToggle"');
    expect(index).toContain('src="localization.js');
    expect(index).toContain('src="game.js');
    expect(index).toContain('src="assets/');
    expect(ending).toContain('href="styles.css');
    expect(ending).toContain('id="languageToggle"');
    expect(ending).toContain('src="localization.js');
    expect(game).toContain('const ENDING_PAGE = "ending.html"');
    expect(game).toContain('I18N.init()');
    expect(localization).toContain('three-sun-chronicle:language:v1');
    expect(localization).toContain('searchParams.get("lang")');
    expect(endings.match(/nameEn:/g)).toHaveLength(12);
    expect(endings.match(/paragraphsEn:/g)).toHaveLength(12);
    expect(endings.match(/quoteEn:/g)).toHaveLength(12);
    expect(index).toContain('href="https://techecho.org/"');
    expect(ending).toContain('href="https://techecho.org/"');
    expect(ending.match(/new URL\("legacy.html", window.location.href\)/g)).toHaveLength(3);
    expect(ending).not.toContain('new URL("index.html", window.location.href)');
  });
});
