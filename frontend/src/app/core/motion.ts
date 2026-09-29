import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy, inject } from '@angular/core';

/**
 * Scroll-triggered entrance: <div appReveal="up" [delay]="150">.
 * Directions are styled in styles.scss (up, down, left, right, zoom, blur).
 */
@Directive({ selector: '[appReveal]', standalone: true })
export class RevealDirective implements AfterViewInit, OnDestroy {
  @Input() appReveal: string = 'up';
  @Input() delay = 0;
  private el = inject(ElementRef<HTMLElement>);
  private io?: IntersectionObserver;

  ngAfterViewInit() {
    const node = this.el.nativeElement as HTMLElement;
    // Also covers [appReveal]="expr" bindings, which don't leave the attribute in the DOM.
    node.setAttribute('appReveal', this.appReveal || 'up');
    node.style.transitionDelay = `${this.delay}ms`;
    this.io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { node.classList.add('in'); this.io?.disconnect(); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    this.io.observe(node);
  }

  ngOnDestroy() { this.io?.disconnect(); }
}

/** Counts a number up when it scrolls into view: <span [appCountUp]="42"></span> */
@Directive({ selector: '[appCountUp]', standalone: true })
export class CountUpDirective implements AfterViewInit, OnDestroy {
  @Input() appCountUp = 0;
  @Input() suffix = '';
  private el = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private io?: IntersectionObserver;

  ngAfterViewInit() {
    const node = this.el.nativeElement as HTMLElement;
    node.textContent = '0' + this.suffix;
    this.io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      this.io?.disconnect();
      this.zone.runOutsideAngular(() => {
        const start = performance.now(), dur = 1800, target = this.appCountUp;
        const step = (now: number) => {
          const p = Math.min((now - start) / dur, 1);
          node.textContent = Math.round(target * (1 - Math.pow(1 - p, 4))).toLocaleString('en-IN') + this.suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    this.io.observe(node);
  }

  ngOnDestroy() { this.io?.disconnect(); }
}

/** Subtle scroll parallax: <img appParallax [speed]="0.2"> */
@Directive({ selector: '[appParallax]', standalone: true })
export class ParallaxDirective implements AfterViewInit, OnDestroy {
  @Input() speed = 0.15;
  private el = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);
  private raf = 0;
  private onScroll = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      const node = this.el.nativeElement as HTMLElement;
      const r = node.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - innerHeight / 2) * -this.speed;
      node.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
    });
  };

  ngAfterViewInit() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.zone.runOutsideAngular(() => addEventListener('scroll', this.onScroll, { passive: true }));
    this.onScroll();
  }

  ngOnDestroy() { removeEventListener('scroll', this.onScroll); cancelAnimationFrame(this.raf); }
}

/** Splits paragraphs on blank lines for safe rendering of plain-text bodies. */
export function paragraphs(text?: string | null): string[] {
  return (text ?? '').split(/\n\s*\n|\r\n\s*\r\n/).map(s => s.trim()).filter(Boolean);
}
