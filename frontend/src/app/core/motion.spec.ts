import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CountUpDirective, RevealDirective, paragraphs } from './motion';

describe('paragraphs()', () => {
  it('splits on blank lines and trims', () => {
    expect(paragraphs('One.\n\nTwo.\n  \nThree.')).toEqual(['One.', 'Two.', 'Three.']);
  });
  it('keeps single line breaks inside a paragraph', () => {
    expect(paragraphs('Line a\nLine b')).toEqual(['Line a\nLine b']);
  });
  it('handles empty input', () => {
    expect(paragraphs(undefined)).toEqual([]);
    expect(paragraphs('')).toEqual([]);
  });
});

/** Replaces IntersectionObserver so tests can decide when something scrolls into view. */
class FakeIO {
  static all: FakeIO[] = [];
  targets: Element[] = [];
  disconnected = false;
  constructor(private cb: IntersectionObserverCallback) { FakeIO.all.push(this); }
  observe(el: Element) { this.targets.push(el); }
  disconnect() { this.disconnected = true; }
  unobserve() {}
  takeRecords() { return []; }
  show() { this.cb(this.targets.map(t => ({ isIntersecting: true, target: t }) as any), this as any); }
}

@Component({
  standalone: true,
  imports: [RevealDirective, CountUpDirective],
  template: `
    <div id="a" appReveal="left" [delay]="200">A</div>
    <div id="b" [appReveal]="dir">B</div>
    <span id="c" [appCountUp]="42" suffix="+"></span>
  `,
})
class Host { dir = 'right'; }

describe('RevealDirective & CountUpDirective', () => {
  let orig: typeof IntersectionObserver;
  beforeEach(() => {
    FakeIO.all = [];
    orig = window.IntersectionObserver;
    (window as any).IntersectionObserver = FakeIO;
  });
  afterEach(() => ((window as any).IntersectionObserver = orig));

  it('starts hidden with direction + delay, and animates in when scrolled into view', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const a = f.nativeElement.querySelector('#a') as HTMLElement;
    expect(a.getAttribute('appReveal')).toBe('left');
    expect(a.style.transitionDelay).toBe('200ms');
    expect(a.classList.contains('in')).toBeFalse();
    FakeIO.all[0].show();
    expect(a.classList.contains('in')).toBeTrue();
    expect(FakeIO.all[0].disconnected).toBeTrue();
  });

  it('bound directions are written to the DOM so CSS can style them', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    expect(f.nativeElement.querySelector('#b').getAttribute('appReveal')).toBe('right');
  });

  it('counter starts at zero and counts up to the target when visible', async () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const c = f.nativeElement.querySelector('#c') as HTMLElement;
    expect(c.textContent).toBe('0+');
    FakeIO.all.find(io => io.targets.includes(c))!.show();
    await new Promise(r => setTimeout(r, 2100));
    expect(c.textContent).toBe('42+');
  });
});
