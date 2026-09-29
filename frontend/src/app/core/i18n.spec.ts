import { DICT, DISTRICTS, ENQUIRY_TYPES, MENU } from './i18n';

const KANNADA = /[ಀ-೿]/;

describe('i18n dictionary', () => {
  it('every entry has non-empty English and Kannada', () => {
    const bad = Object.entries(DICT).filter(([, v]) => !v.en?.trim() || !v.kn?.trim()).map(([k]) => k);
    expect(bad).withContext('keys missing a language').toEqual([]);
  });

  it('Kannada values actually contain Kannada script (except intentional English labels)', () => {
    const allowedLatin = ['lang.switch']; // shows the *other* language's name
    const bad = Object.entries(DICT)
      .filter(([k, v]) => !allowedLatin.includes(k) && !KANNADA.test(v.kn) && !/^[\d\s·+.,:%-]*$/.test(v.kn))
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });

  it('has a label for every menu category in both languages', () => {
    for (const c of [...MENU.press, ...MENU.views, ...MENU.gallery]) {
      expect(DICT['cat.' + c]).withContext('cat.' + c).toBeDefined();
    }
  });

  it('has a label for every enquiry type', () => {
    for (const t of ENQUIRY_TYPES) expect(DICT['type.' + t]).withContext('type.' + t).toBeDefined();
  });

  it('has every key the pages build dynamically', () => {
    const keys = [
      ...[1, 2, 3].flatMap(n => [`hero.s${n}.title`, `hero.s${n}.text`, `contact.step${n}`, `contact.step${n}.d`]),
      ...[1, 2, 3, 4, 5, 6].flatMap(n => [`init.${n}.t`, `init.${n}.d`]),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(n => [`pos.${n}.r`, `pos.${n}.o`]),
      ...['father', 'native', 'qual', 'family'].flatMap(f => [`about.${f}`, `about.${f}.v`]),
      'state.ka', 'state.tn', 'state.ap', 'nav.signin', 'footer.admin',
      'nav.press', 'nav.views', 'nav.stalwart', 'press.lead', 'views.lead', 'stalwart.lead',
    ];
    expect(keys.filter(k => !DICT[k])).toEqual([]);
  });

  it('hero titles are two lines', () => {
    for (const n of [1, 2, 3]) {
      expect(DICT[`hero.s${n}.title`].en.split('\n').length).toBe(2);
      expect(DICT[`hero.s${n}.title`].kn.split('\n').length).toBe(2);
    }
  });

  it('lists all 31 Karnataka districts, each translated, no duplicates', () => {
    expect(DISTRICTS.length).toBe(31);
    expect(new Set(DISTRICTS.map(d => d.en)).size).toBe(31);
    expect(DISTRICTS.every(d => KANNADA.test(d.kn))).toBeTrue();
    expect(DISTRICTS.map(d => d.en)).toContain('Tumakuru');
  });

  it('menus match the reference footer', () => {
    expect(MENU.press).toEqual(['news', 'interviews', 'editorials', 'critic', 'press-releases']);
    expect(MENU.views).toEqual(['quotes', 'blogs', 'articles']);
    expect(MENU.gallery).toEqual(['timeline', 'lighter-side', 'election-rally', 'government-events', 'spiritual-side']);
  });
});
