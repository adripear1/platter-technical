/*
 * Product slider behavior.
 * Self-contained: it only looks at elements inside <product-slider>.
 * Desktop slides a 4.75-card row. Below 768px the first cards stay put
 * and Show more drops the rest open.
 */
(() => {
  const DESKTOP_QUERY = "(min-width: 768px)";
  const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

  const rtlScrollType = (() => {
    let cached = null;

    return () => {
      if (cached) return cached;

      const probe = document.createElement("div");
      const inner = document.createElement("div");
      probe.dir = "rtl";
      probe.style.cssText = "width:4px;height:1px;position:absolute;top:-9999px;overflow:scroll;";
      inner.style.width = "8px";
      inner.style.height = "1px";
      probe.append(inner);
      document.body.append(probe);

      if (probe.scrollLeft > 0) {
        cached = "default";
      } else {
        probe.scrollLeft = 1;
        cached = probe.scrollLeft === 0 ? "negative" : "reverse";
      }

      probe.remove();
      return cached;
    };
  })();

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  class ProductSlider extends HTMLElement {
    connectedCallback() {
      if (this.mounted) return;

      this.track = this.querySelector("[data-slider-track]");
      this.progress = this.querySelector("[data-slider-progress]");
      this.bar = this.querySelector("[data-slider-progress-bar]");
      this.more = this.querySelector("[data-more]");
      this.showMore = this.querySelector("[data-show-more]");
      this.showMoreLabel = this.querySelector("[data-show-more-label]");

      if (!this.track) return;

      this.mounted = true;
      this.desktopQuery = window.matchMedia(DESKTOP_QUERY);
      this.motionQuery = window.matchMedia(MOTION_QUERY);
      this.abort = new AbortController();
      this.pending = false;
      this.dragging = false;
      this.moved = false;
      this.seeking = false;

      const signal = this.abort.signal;

      this.track.addEventListener("scroll", () => this.updateProgress(), { passive: true, signal });
      this.track.addEventListener("pointerdown", (event) => this.onPointerDown(event), { signal });
      this.track.addEventListener("click", (event) => this.onClick(event), { capture: true, signal });
      this.track.addEventListener("dragstart", (event) => event.preventDefault(), { signal });

      if (this.progress) {
        this.progress.addEventListener("pointerdown", (event) => this.onProgressDown(event), { signal });
        this.progress.addEventListener("pointermove", (event) => this.onProgressMove(event), { signal });
        this.progress.addEventListener("pointerup", (event) => this.onProgressUp(event), { signal });
        this.progress.addEventListener("pointercancel", (event) => this.onProgressUp(event), { signal });
        this.progress.addEventListener("pointerenter", () => this.setThumbHot(true), { signal });
        this.progress.addEventListener("pointerleave", (event) => {
          if (this.seeking || this.pointerOverProgress(event)) return;
          this.setThumbHot(false);
        }, { signal });
        this.progress.addEventListener("keydown", (event) => this.onKey(event), { signal });
      }

      if (this.showMore && this.more) {
        this.showMore.addEventListener("click", () => this.toggleMore(), { signal });
      }

      this.desktopQuery.addEventListener("change", () => this.onBreakpointChange(), { signal });
      this.observer = new ResizeObserver(() => this.onViewportChange());
      this.observer.observe(this.track);

      this.track.querySelectorAll("img").forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", () => this.updateProgress(), { once: true, signal });
        }
      });

      this.markLastRow();
      this.syncMoreAccess();
      this.updateProgress();
    }

    disconnectedCallback() {
      this.abort?.abort();
      this.detachDrag();
      this.observer?.disconnect();
      this.mounted = false;
    }

    isDesktop() {
      return this.desktopQuery.matches;
    }

    prefersReducedMotion() {
      return this.motionQuery.matches;
    }

    isRtl() {
      return getComputedStyle(this.track).direction === "rtl";
    }

    maxScroll() {
      return Math.max(0, this.track.scrollWidth - this.track.clientWidth);
    }

    normalizedScroll() {
      const max = this.maxScroll();
      const raw = this.track.scrollLeft;

      if (!this.isRtl()) return raw;
      if (rtlScrollType() === "negative") return -raw;
      if (rtlScrollType() === "reverse") return max - raw;
      return raw;
    }

    nativeScrollLeft(normalized) {
      const max = this.maxScroll();
      const value = clamp(normalized, 0, max);

      if (!this.isRtl()) return value;
      if (rtlScrollType() === "negative") return -value;
      if (rtlScrollType() === "reverse") return max - value;
      return value;
    }

    cardStep() {
      const card = this.track.querySelector("[data-slider-card]");
      if (!card) return 0;

      const styles = getComputedStyle(this.track);
      const gap = parseFloat(styles.columnGap) || parseFloat(styles.gap) || 0;
      return card.getBoundingClientRect().width + gap;
    }

    animateTo(normalized) {
      this.track.scrollTo({
        left: this.nativeScrollLeft(normalized),
        behavior: this.prefersReducedMotion() ? "auto" : "smooth",
      });
    }

    updateProgress() {
      if (!this.bar || !this.progress) return;

      const max = this.maxScroll();
      const current = clamp(this.normalizedScroll(), 0, max);
      const { scrollWidth, clientWidth } = this.track;
      const thumb = clamp(scrollWidth <= 0 ? 100 : (clientWidth / scrollWidth) * 100, 0, 100);
      const offset = max <= 0 ? 0 : (current / max) * (100 - thumb);

      this.bar.style.width = `${thumb}%`;
      this.bar.style.insetInlineStart = `${offset}%`;

      const value = max <= 0 ? 0 : Math.round((current / max) * 100);
      this.progress.setAttribute("aria-valuenow", String(value));

      const step = this.cardStep();
      const total = this.track.querySelectorAll("[data-slider-card]").length;
      if (step > 0 && total > 0) {
        const index = clamp(Math.round(current / step) + 1, 1, total);
        this.progress.setAttribute("aria-valuetext", `Card ${index} of ${total}`);
      }
    }

    onPointerDown(event) {
      if (!this.isDesktop() || event.pointerType === "touch" || event.button !== 0) return;

      this.pending = true;
      this.dragging = false;
      this.moved = false;
      this.startX = event.clientX;
      this.startNormalized = this.normalizedScroll();
      this.detachDrag();
      this.dragAbort = new AbortController();

      const { signal } = this.dragAbort;
      window.addEventListener("pointermove", (moveEvent) => this.onPointerMove(moveEvent), { signal });
      window.addEventListener("pointerup", () => this.onPointerUp(), { signal });
      window.addEventListener("pointercancel", () => this.onPointerUp(), { signal });
    }

    onPointerMove(event) {
      if (!this.pending && !this.dragging) return;

      const delta = event.clientX - this.startX;
      if (!this.dragging) {
        if (Math.abs(delta) <= 5) return;
        this.dragging = true;
        this.moved = true;
        this.classList.add("is-dragging");
      }

      this.track.scrollLeft = this.nativeScrollLeft(this.startNormalized - delta);
    }

    onPointerUp() {
      if (!this.pending && !this.dragging) return;

      const shouldSnap = this.dragging;
      this.pending = false;
      this.dragging = false;
      this.classList.remove("is-dragging");
      this.detachDrag();

      if (shouldSnap) this.snapToNearest();

      window.setTimeout(() => {
        this.moved = false;
      }, 0);
    }

    detachDrag() {
      this.dragAbort?.abort();
      this.dragAbort = null;
    }

    snapToNearest() {
      const step = this.cardStep();
      if (step <= 0) return;
      this.animateTo(Math.round(this.normalizedScroll() / step) * step);
    }

    onClick(event) {
      if (!this.moved) return;
      event.preventDefault();
      event.stopPropagation();
    }

    onKey(event) {
      if (!this.isDesktop() || event.altKey || event.metaKey || event.ctrlKey) return;

      const step = this.cardStep();
      const direction = this.isRtl() ? -1 : 1;
      const max = this.maxScroll();
      let next = null;

      if (event.key === "ArrowRight") next = this.normalizedScroll() + step * direction;
      else if (event.key === "ArrowLeft") next = this.normalizedScroll() - step * direction;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = max;
      else return;

      event.preventDefault();
      this.animateTo(next);
    }

    ratioFromEvent(event) {
      const rect = this.progress.getBoundingClientRect();
      if (rect.width <= 0) return 0;

      let ratio = (event.clientX - rect.left) / rect.width;
      if (this.isRtl()) ratio = 1 - ratio;
      return clamp(ratio, 0, 1);
    }

    pointerOverProgress(event) {
      if (!this.progress || !event) return false;

      const rect = this.progress.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    }

    setThumbHot(hot) {
      this.progress.classList.toggle("is-touching", hot);
    }

    onProgressDown(event) {
      if (!this.isDesktop() || event.button !== 0) return;

      this.seeking = true;
      this.classList.add("is-dragging");
      this.setThumbHot(true);

      if (event.pointerId != null) {
        this.progress.setPointerCapture(event.pointerId);
      }

      this.track.scrollLeft = this.nativeScrollLeft(this.ratioFromEvent(event) * this.maxScroll());
      this.progress.focus({ preventScroll: true });
      event.preventDefault();
    }

    onProgressMove(event) {
      if (!this.seeking) return;
      this.track.scrollLeft = this.nativeScrollLeft(this.ratioFromEvent(event) * this.maxScroll());
    }

    onProgressUp(event) {
      if (!this.seeking) return;

      this.seeking = false;
      this.classList.remove("is-dragging");

      if (event && event.pointerId != null && this.progress.hasPointerCapture(event.pointerId)) {
        this.progress.releasePointerCapture(event.pointerId);
      }

      this.setThumbHot(this.pointerOverProgress(event) || this.progress.matches(":hover"));
    }

    toggleMore() {
      if (!this.more || !this.showMore) return;

      const open = !this.more.classList.contains("is-open");
      const cssReveal = this.prefersCssReveal();
      const startHeight = cssReveal ? 0 : this.more.getBoundingClientRect().height;
      const startMargin = cssReveal ? "0px" : getComputedStyle(this.more).marginTop;

      this.more.classList.toggle("is-open", open);
      this.showMore.setAttribute("aria-expanded", String(open));

      const moreLabel = this.dataset.showMoreLabel || "Show more";
      const lessLabel = this.dataset.showLessLabel || "Show less";
      if (this.showMoreLabel) this.showMoreLabel.textContent = open ? lessLabel : moreLabel;

      if (!open && this.more.contains(document.activeElement)) {
        this.showMore.focus();
      }

      this.syncMoreAccess();
      this.animateMore(open, startHeight, startMargin);
    }

    prefersCssReveal() {
      return CSS.supports("interpolate-size", "allow-keywords") && !this.isDesktop() && !this.motionQuery.matches;
    }

    animateMore(open, startHeight, startMargin) {
      const panel = this.more;

      if (this.prefersCssReveal()) return;

      const inner = panel.querySelector("[data-more-inner]");
      panel.getAnimations().forEach((animation) => animation.cancel());

      if (!inner || this.isDesktop() || this.motionQuery.matches) {
        panel.style.height = "";
        panel.style.marginTop = "";
        return;
      }

      const gap = getComputedStyle(panel).getPropertyValue("--row-gap").trim() || "20px";
      panel.style.height = "auto";
      panel.style.marginTop = open ? gap : "0px";
      const endHeight = open ? inner.getBoundingClientRect().height : 0;
      const endMargin = open ? gap : "0px";

      panel.style.height = `${startHeight}px`;
      panel.style.marginTop = startMargin;

      const animation = panel.animate(
        [
          { height: `${startHeight}px`, marginTop: startMargin },
          { height: `${endHeight}px`, marginTop: endMargin },
        ],
        { duration: 500, easing: "cubic-bezier(0.45, 0.05, 0.2, 1)", fill: "forwards" }
      );

      animation.onfinish = () => {
        panel.style.height = "";
        panel.style.marginTop = "";
        animation.cancel();
      };
    }

    syncMoreAccess() {
      if (!this.more) return;

      const collapsed = !this.isDesktop() && !this.more.classList.contains("is-open");
      this.more.toggleAttribute("inert", collapsed);
      this.more.setAttribute("aria-hidden", collapsed ? "true" : "false");

      if (this.showMore) {
        this.showMore.hidden = !this.more.querySelector("[data-slider-card]");
      }
    }

    markLastRow() {
      const cards = [...this.track.children].filter((node) => node.matches("[data-slider-card]"));
      cards.forEach((card, index) => {
        card.classList.toggle("is-last-row", cards.length - index <= 2);
      });
    }

    onBreakpointChange() {
      if (this.more) {
        this.more.getAnimations().forEach((animation) => animation.cancel());
        this.more.style.height = "";
        this.more.style.marginTop = "";
      }

      this.onViewportChange();
    }

    onViewportChange() {
      this.markLastRow();
      this.syncMoreAccess();
      this.updateProgress();
    }
  }

  if (!customElements.get("product-slider")) {
    customElements.define("product-slider", ProductSlider);
  }

  document.addEventListener("shopify:section:load", (event) => {
    event.target.querySelectorAll("product-slider").forEach((slider) => {
      if (typeof slider.connectedCallback === "function" && !slider.mounted) {
        slider.connectedCallback();
      }
    });
  });
})();
