document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Nav: scrolled state ---------- */
  const nav = document.getElementById('siteNav');
  const onScrollNav = () => {
    if (window.scrollY > 24) nav.classList.add('is-scrolled');
    else nav.classList.remove('is-scrolled');
  };
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');
  burger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal-up');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  revealEls.forEach(el => io.observe(el));

  /* ---------- Animated stat counters ---------- */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const statNums = document.querySelectorAll('.stat-card__num[data-count-to]');

  function formatStatValue(value, decimals, suffix) {
    const usesK = suffix.indexOf('K') !== -1;
    const plainSuffix = suffix.replace('K', '');
    if (usesK) {
      const inK = value / 1000;
      return inK.toFixed(decimals) + 'K' + plainSuffix;
    }
    return Math.round(value).toLocaleString('en-US') + plainSuffix;
  }

  function animateStat(el) {
    const target = parseFloat(el.dataset.countTo || '0');
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';

    if (prefersReducedMotion) {
      el.textContent = formatStatValue(target, decimals, suffix);
      return;
    }

    const duration = 1800;
    const start = performance.now();

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      const current = target * eased;
      el.textContent = formatStatValue(current, decimals, suffix);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatStatValue(target, decimals, suffix);
      }
    }
    requestAnimationFrame(tick);
  }

  if (statNums.length) {
    const statsIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateStat(entry.target);
          statsIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    statNums.forEach(el => statsIO.observe(el));
  }

  /* ---------- Route rail progress (desktop signature element) ---------- */
  const rail = document.querySelector('.route-rail');
  const railFill = document.querySelector('.route-rail__fill');
  const railPin = document.getElementById('routePin');
  const railPath = document.querySelector('.route-rail__fill');

  function updateRail() {
    if (!rail || window.innerWidth < 1100) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = Math.min(Math.max(scrollTop / docHeight, 0), 1);

    const pathLength = railPath.getTotalLength ? railPath.getTotalLength() : 1400;
    railFill.style.strokeDasharray = pathLength;
    railFill.style.strokeDashoffset = pathLength * (1 - progress);

    // move pin along path
    if (railPath.getPointAtLength) {
      const point = railPath.getPointAtLength(pathLength * progress);
      const railHeight = rail.offsetHeight;
      const svgHeight = 1000; // matches viewBox height
      const pinTopPx = (point.y / svgHeight) * railHeight;
      railPin.style.top = pinTopPx + 'px';
      railPin.style.left = (point.x / 40 * rail.offsetWidth) + 'px';
    }
  }
  window.addEventListener('scroll', updateRail, { passive: true });
  window.addEventListener('resize', updateRail);
  updateRail();

  /* ---------- Founder "read more" ---------- */
  const bioText = document.getElementById('bioText');
  const readMoreBtn = document.getElementById('readMoreBtn');
  readMoreBtn.addEventListener('click', () => {
    const isOpen = bioText.classList.toggle('is-open');
    readMoreBtn.classList.toggle('is-open', isOpen);
    readMoreBtn.querySelector('span').textContent = isOpen ? 'Show Less' : 'Read Full Story';
    if (!isOpen) {
      bioText.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  /* ---------- Episode carousel speed ---------- */
  // Pixels-per-second the track scrolls at. Raise this number to make it faster,
  // lower it to slow it down.
  const MARQUEE_SPEED_PX_PER_SEC = 55;

  const episodesTrack = document.getElementById('episodesTrack');
  const episodesSub = document.getElementById('episodesSub');
  function setMarqueeDuration() {
    if (!episodesTrack) return;
    // The track holds two identical sets of cards back to back (for the seamless
    // loop), so one full set's width is exactly half the track's scroll width.
    const oneSetWidth = episodesTrack.scrollWidth / 2;
    if (!oneSetWidth) return;
    const duration = oneSetWidth / MARQUEE_SPEED_PX_PER_SEC;
    episodesTrack.style.setProperty('--marquee-duration', duration + 's');
  }
  window.addEventListener('resize', setMarqueeDuration);

  /* ---------- Episode cards ---------- */
  const toast = document.getElementById('toast');
  const toastText = toast.querySelector('p');
  const toastLink = toast.querySelector('a');
  let toastTimer;
  function showToast(message, linkHref, linkText) {
    clearTimeout(toastTimer);
    toastText.innerHTML = message;
    if (linkHref) {
      toastLink.style.display = 'inline';
      toastLink.href = linkHref;
      toastLink.textContent = linkText || 'Learn more →';
    } else {
      toastLink.style.display = 'none';
    }
    toast.classList.add('is-visible');
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4500);
  }

  const YT_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.51 3.5 12 3.5 12 3.5s-7.51 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.49 20.5 12 20.5 12 20.5s7.51 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z"/></svg>';
  const SP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.021.419 1.561-.299.421-1.02.599-1.559.3z"/></svg>';

  function escAttr(v = '') {
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildCardHtml(ep, index, total, hidden) {
    const num = String(total - index).padStart(2, '0');
    const yt = ep.youtubeLink || '';
    const sp = ep.spotifyLink || '';
    const label = ep.title ? escAttr(ep.title) : `Episode ${num}`;
    const a11y = hidden ? ' aria-hidden="true" tabindex="-1"' : '';
    const iconsA11y = hidden ? ' aria-hidden="true"' : '';
    const iconTab = hidden ? ' tabindex="-1"' : '';
    return `
      <button class="ep-card"${a11y} data-link="${escAttr(yt)}" style="--img:url('${escAttr(ep.imageUrl)}')">
        <span class="ep-card__num">${label}</span>
        <span class="ep-card__play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
        <span class="ep-card__icons"${iconsA11y}>
          <span class="ep-card__icon ep-card__icon--yt" data-icon-link="${escAttr(yt)}" role="link" aria-label="Watch on YouTube"${iconTab}>${YT_ICON}</span>
          <span class="ep-card__icon ep-card__icon--sp" data-icon-link="${escAttr(sp)}" role="link" aria-label="Listen on Spotify"${iconTab}>${SP_ICON}</span>
        </span>
      </button>`;
  }

  function wireUpCards() {
    document.querySelectorAll('.ep-card').forEach(card => {
      card.addEventListener('click', () => {
        const link = card.getAttribute('data-link');
        const isSoon = card.getAttribute('data-soon') === 'true';
        if (isSoon) {
          showToast('This episode is <strong>coming soon</strong> — follow on LinkedIn for updates.', 'https://www.linkedin.com/company/ladies-leadership-logistics/', 'Visit LinkedIn →');
        } else if (link) {
          window.open(link, '_blank', 'noopener');
        }
      });
    });

    /* Per-card YouTube / Spotify icons — open their own link without triggering the card's YouTube click */
    document.querySelectorAll('.ep-card__icon').forEach(icon => {
      const openIconLink = (e) => {
        e.stopPropagation();
        const link = icon.getAttribute('data-icon-link');
        if (link) window.open(link, '_blank', 'noopener');
      };
      icon.addEventListener('click', openIconLink);
      icon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openIconLink(e);
        }
      });
    });
  }

  async function loadEpisodes() {
    if (!episodesTrack) return;
    try {
      const res = await fetch('/api/episodes');
      const data = await res.json();
      const episodes = Array.isArray(data.episodes) ? data.episodes : [];
      if (!episodes.length) {
        episodesTrack.innerHTML = '';
        if (episodesSub) episodesSub.textContent = 'New episodes coming soon.';
        return;
      }
      if (episodesSub) episodesSub.textContent = `${episodes.length} stop${episodes.length === 1 ? '' : 's'} on the route so far — tap a card to watch.`;
      const total = episodes.length;
      // Render the set twice back-to-back for a seamless marquee loop; the
      // second copy is hidden from assistive tech and keyboard focus.
      const visible = episodes.map((ep, i) => buildCardHtml(ep, i, total, false)).join('');
      const hidden = episodes.map((ep, i) => buildCardHtml(ep, i, total, true)).join('');
      episodesTrack.innerHTML = visible + hidden;
      wireUpCards();
      setMarqueeDuration();
    } catch (err) {
      console.error('Unable to load episodes', err);
    }
  }

  loadEpisodes();

  /* ---------- Star rating ---------- */
  const starRating = document.getElementById('starRating');
  const ratingValue = document.getElementById('ratingValue');
  if (starRating) {
    const stars = Array.from(starRating.querySelectorAll('.star'));

    function paintStars(count) {
      stars.forEach(s => {
        const active = Number(s.dataset.value) <= count;
        s.classList.toggle('is-hover', active);
      });
    }
    function setActive(count) {
      stars.forEach(s => {
        const active = Number(s.dataset.value) <= count;
        s.classList.toggle('is-active', active);
        s.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }

    stars.forEach(star => {
      star.addEventListener('mouseenter', () => paintStars(Number(star.dataset.value)));
      star.addEventListener('focus', () => paintStars(Number(star.dataset.value)));
      star.addEventListener('click', () => {
        const value = Number(star.dataset.value);
        ratingValue.value = value;
        setActive(value);
      });
    });
    starRating.addEventListener('mouseleave', () => paintStars(Number(ratingValue.value)));
  }

  /* ---------- API-backed forms ---------- */
  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    return data;
  }

  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rating = Number(ratingValue.value);
      const name = feedbackForm.name.value.trim();
      const message = feedbackForm.message.value.trim();
      if (rating === 0) return showToast('Please choose a star rating before sending your feedback.', null, null);
      if (!message) return showToast('Please add a short message so we know what you loved.', null, null);
      try {
        await apiRequest('/api/feedback', {
          method: 'POST',
          body: JSON.stringify({ rating, name, message })
        });
        feedbackForm.reset();
        ratingValue.value = 0;
        setActive(0);
        showToast('Thank you — your feedback has been received.', null, null);
        loadReviews();
      } catch (err) {
        showToast(err.message, null, null);
      }
    });
  }

  const guestForm = document.getElementById('guestForm');
  if (guestForm) {
    guestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = guestForm.name.value.trim();
      const email = guestForm.email.value.trim();
      const message = guestForm.message.value.trim();
      if (!name || !email || !message) return showToast('Please fill in your name, email, and a short note before sending.', null, null);
      try {
        await apiRequest('/api/guest-requests', {
          method: 'POST',
          body: JSON.stringify({ name, email, message })
        });
        guestForm.reset();
        showToast('Thanks — your guest request has been sent to the team.', null, null);
      } catch (err) {
        showToast(err.message, null, null);
      }
    });
  }

  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = newsletterForm.name.value.trim();
      const email = newsletterForm.email.value.trim();
      if (!name || !email) return showToast('Please enter your name and email.', null, null);
      try {
        await apiRequest('/api/subscribers', {
          method: 'POST',
          body: JSON.stringify({ name, email })
        });
        newsletterForm.reset();
        showToast('You’re subscribed — welcome to the community.', null, null);
      } catch (err) {
        showToast(err.message, null, null);
      }
    });
  }

  async function loadReviews() {
    const grid = document.getElementById('reviewsGrid');
    if (!grid) return;
    try {
      const { reviews } = await apiRequest('/api/reviews');
      if (!reviews.length) {
        grid.innerHTML = '<p class="reviews__empty">Be the first to share your experience.</p>';
        return;
      }
      grid.innerHTML = reviews.map(r => `
        <article class="review-card reveal-up is-visible">
          <div class="review-card__stars" aria-label="${r.rating} out of 5 stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
          <p class="review-card__message">“${escapeHtml(r.message)}”</p>
          <p class="review-card__name">— ${escapeHtml(r.name || 'Community Member')}</p>
        </article>
      `).join('');
    } catch {
      grid.innerHTML = '<p class="reviews__empty">Reviews will appear here soon.</p>';
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  loadReviews();

  /* ---------- WhatsApp community link (placeholder until real link is added) ---------- */
  const whatsappLink = document.getElementById('whatsappLink');
  if (whatsappLink) {
    whatsappLink.addEventListener('click', (e) => {
      if (whatsappLink.getAttribute('href') === '#') {
        e.preventDefault();
        showToast('Our WhatsApp community link is <strong>coming soon</strong> — check back shortly.', null, null);
      }
    });
  }

});