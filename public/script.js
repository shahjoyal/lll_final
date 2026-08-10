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