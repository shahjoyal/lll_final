/* =========================================================
   3D FLIP BUSINESS CARD
   - Click or drag (mouse/touch) to flip between front & back
   - Subtle pointer-follow tilt while idle
   - Export the card as a PNG (both sides stacked) or a
     two-page PDF, regardless of which side is showing
   ========================================================= */
(function () {
  const card = document.getElementById('bizCard');
  if (!card) return;

  const inner = document.getElementById('bizCardInner');
  const frontEl = document.getElementById('bizCardFront');
  const backEl = document.getElementById('bizCardBack');
  const flipBtn = document.getElementById('bizCardFlipBtn');
  const pngBtn = document.getElementById('bizCardDownloadPng');
  const pdfBtn = document.getElementById('bizCardDownloadPdf');
  const hint = document.getElementById('bizCardHint');

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  let flipped = false;
  let dragging = false;
  let dragStartX = 0;
  let dragDeltaX = 0;
  let pointerId = null;

  function setFlipped(next) {
    flipped = next;
    card.classList.toggle('is-flipped', flipped);
    card.setAttribute('aria-pressed', String(flipped));
  }

  function toggleFlip() {
    setFlipped(!flipped);
  }

  /* ---------- Click / keyboard flip ---------- */
  flipBtn.addEventListener('click', toggleFlip);
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleFlip();
    }
  });

  /* ---------- Drag-to-flip (mouse + touch, unified via Pointer Events) ---------- */
  card.addEventListener('pointerdown', e => {
    dragging = true;
    pointerId = e.pointerId;
    dragStartX = e.clientX;
    dragDeltaX = 0;
    card.classList.add('is-dragging');
    card.setPointerCapture(pointerId);
  });

  card.addEventListener('pointermove', e => {
    if (!dragging) {
      if (!isTouch && !reduceMotion) applyTilt(e);
      return;
    }
    dragDeltaX = e.clientX - dragStartX;
    const base = flipped ? 180 : 0;
    // live rotation follows the finger/cursor, resisted slightly at the ends
    const dragRotation = Math.max(-180, Math.min(180, (dragDeltaX / card.offsetWidth) * 180));
    inner.style.transform = `rotateY(${base - dragRotation}deg)`;
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('is-dragging');
    inner.style.transform = '';
    if (Math.abs(dragDeltaX) < 6) {
      // negligible movement = treat as a click/tap
      toggleFlip();
    } else if (Math.abs(dragDeltaX) > card.offsetWidth * 0.22) {
      // dragged far enough to commit to a flip
      setFlipped(!flipped);
    }
    // otherwise: released mid-drag without crossing the threshold — snaps back as-is
    dragDeltaX = 0;
  }

  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);

  /* Clicking directly (non-drag) also flips — pointerup with negligible
     movement already handles this, so we skip a native 'click' toggle
     to avoid a double-flip. */

  /* ---------- Idle pointer tilt for a glossy, tactile feel ---------- */
  function applyTilt(e) {
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const tiltX = py * -8;
    const tiltY = px * 10;
    const base = flipped ? 180 : 0;
    inner.style.transform = `rotateY(${base + tiltY}deg) rotateX(${tiltX}deg)`;
  }

  card.addEventListener('pointerleave', () => {
    if (!dragging) inner.style.transform = '';
  });

  if (hint && isTouch) {
    hint.textContent = 'Tap or swipe the card to flip it';
  }

  /* ---------- Export helpers ----------
     html2canvas can't reliably render an element mid 3D-transform, so we
     clone each face flat (no rotation) off-screen before capturing it —
     this works correctly no matter which side is currently showing. */
  function captureFace(faceEl) {
    const rect = faceEl.getBoundingClientRect();
    const clone = faceEl.cloneNode(true);
    clone.style.position = 'fixed';
    clone.style.top = '-10000px';
    clone.style.left = '-10000px';
    clone.style.transform = 'none';
    clone.style.backfaceVisibility = 'visible';
    clone.style.webkitBackfaceVisibility = 'visible';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.margin = '0';
    document.body.appendChild(clone);
    return window.html2canvas(clone, { backgroundColor: null, scale: 3, useCORS: true })
      .then(canvas => {
        document.body.removeChild(clone);
        return canvas;
      })
      .catch(err => {
        document.body.removeChild(clone);
        throw err;
      });
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.style.opacity = busy ? '0.6' : '';
    btn.style.pointerEvents = busy ? 'none' : '';
  }

  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function ensureLibs() {
    if (!window.html2canvas || !window.jspdf) {
      if (hint) hint.textContent = 'Still loading the export tools — try again in a moment.';
      return false;
    }
    return true;
  }

  /* PNG: front + back stacked in a single shareable image */
  pngBtn.addEventListener('click', async () => {
    if (!(await ensureLibs())) return;
    setBusy(pngBtn, true);
    try {
      const [frontCanvas, backCanvas] = await Promise.all([captureFace(frontEl), captureFace(backEl)]);
      const gap = 24 * 3;
      const combined = document.createElement('canvas');
      combined.width = Math.max(frontCanvas.width, backCanvas.width);
      combined.height = frontCanvas.height + backCanvas.height + gap;
      const ctx = combined.getContext('2d');
      ctx.fillStyle = '#FBF9F4';
      ctx.fillRect(0, 0, combined.width, combined.height);
      ctx.drawImage(frontCanvas, 0, 0);
      ctx.drawImage(backCanvas, 0, frontCanvas.height + gap);
      downloadDataUrl(combined.toDataURL('image/png'), 'lll-business-card.png');
    } catch (err) {
      console.error('PNG export failed', err);
      if (hint) hint.textContent = 'Sorry, the PNG export failed — please try again.';
    } finally {
      setBusy(pngBtn, false);
    }
  });

  /* PDF: two pages, one per side, sized to a standard business-card ratio */
  pdfBtn.addEventListener('click', async () => {
    if (!(await ensureLibs())) return;
    setBusy(pdfBtn, true);
    try {
      const [frontCanvas, backCanvas] = await Promise.all([captureFace(frontEl), captureFace(backEl)]);
      const { jsPDF } = window.jspdf;
      const wIn = 3.5, hIn = 2; // standard business card size
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [wIn, hIn] });
      pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', 0, 0, wIn, hIn);
      pdf.addPage([wIn, hIn], 'landscape');
      pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, wIn, hIn);
      pdf.save('lll-business-card.pdf');
    } catch (err) {
      console.error('PDF export failed', err);
      if (hint) hint.textContent = 'Sorry, the PDF export failed — please try again.';
    } finally {
      setBusy(pdfBtn, false);
    }
  });
})();