/* =========================================================================
   Caraga Region — home page interactions
   Scroll reveals, animated stat counters, a self-drawing route divider,
   and a light cursor parallax on the hero's drifting icons.
   ========================================================================= */

const prefersReducedMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Scroll reveal ----------------------------------------------------
const revealTargets = document.querySelectorAll(
  ".reveal, .reveal-stagger, .route-divider"
);

if (prefersReducedMotion) {
  revealTargets.forEach(el => {
    el.classList.add("in-view", "drawn");
  });
} else if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("in-view");
        entry.target.classList.add("drawn");

        io.unobserve(entry.target);
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -40px 0px" }
  );

  revealTargets.forEach(el => io.observe(el));
} else {
  revealTargets.forEach(el => el.classList.add("in-view", "drawn"));
}

// ---- Animated stat counters -------------------------------------------
function animateCount(el) {
  const target = parseInt(el.dataset.target, 10) || 0;

  if (prefersReducedMotion) {
    el.textContent = target;
    return;
  }

  const duration = 900;
  const start = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    el.textContent = Math.round(eased * target);

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target;
    }
  }

  requestAnimationFrame(tick);
}

const countEls = document.querySelectorAll(".count-up");

if (countEls.length && "IntersectionObserver" in window) {
  const countIo = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        countIo.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );

  countEls.forEach(el => countIo.observe(el));
} else {
  countEls.forEach(el => (el.textContent = el.dataset.target));
}

// ---- Hero cursor parallax on drifting icons ----------------------------
const heroBg = document.querySelector(".home-hero-bg");
const heroEl = document.querySelector(".home-hero");

if (heroBg && heroEl && !prefersReducedMotion) {
  heroEl.addEventListener("mousemove", e => {
    const rect = heroEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    heroBg.style.transform = `translate(${x * 14}px, ${y * 10}px)`;
  });

  heroEl.addEventListener("mouseleave", () => {
    heroBg.style.transform = "translate(0, 0)";
  });
}