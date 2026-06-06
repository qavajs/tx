(function () {
  var activeFilter = 'all';
  var query = '';

  function sc(status) { return status === 'passed' ? 'pass' : status === 'failed' ? 'fail' : 'skip'; }

  function fmt(ms) {
    if (ms >= 60000) return (ms / 60000).toFixed(1) + 'm';
    if (ms >= 1000)  return (ms / 1000).toFixed(2) + 's';
    return ms + 'ms';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var STEP_ICONS = {
    pass: '<svg class="sico pass" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3 3L11.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fail: '<svg class="sico fail" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    info: '<svg class="sico info" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 6.5v3M7 5v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    warn: '<svg class="sico warn" viewBox="0 0 14 14" fill="none"><path d="M7 2.5l4.5 8H2.5L7 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 6v2M7 10v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
  };

  var CHEV = '<svg class="chev open" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var EXI  = '<svg class="exi" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ATT_ICON = '<svg viewBox="0 0 14 14" fill="none" style="width:11px;height:11px"><path d="M8.5 1.5H3.5a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1V5l-3-3.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.5 1.5v3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderStepList(steps) {
    if (!steps || !steps.length) return '';
    return '<ul class="steps">' + steps.map(function(s) {
      var ico = STEP_ICONS[s.state] || STEP_ICONS.info;
      var dur = s.duration != null ? '<span class="sdur">' + fmt(s.duration) + '</span>' : '';
      if (s.children && s.children.length) {
        var open = s.state === 'fail' || s.state === 'warn';
        return '<li class="step-group' + (open ? ' open' : '') + '">'
          + '<div class="step-group-hdr">'
          + '<span class="step-group-chev">&#9658;</span>'
          + '<span>' + esc(s.message) + '</span>'
          + dur
          + '</div>'
          + '<div class="step-group-body">' + renderStepList(s.children) + '</div>'
          + '</li>';
      }
      return '<li class="step">' + ico + '<span>' + esc(s.message) + '</span>' + dur + '</li>';
    }).join('') + '</ul>';
  }

  function renderTest(t) {
    var cls = sc(t.status);
    var steps = '';
    if (t.steps && t.steps.length) {
      steps = renderStepList(t.steps);
    }

    var errBlock = '';
    if (t.error) {
      errBlock = '<div class="err-block"><div class="err-hdr"><span class="err-lbl">Error</span><button class="copy-btn" data-tid="' + t.id + '">Copy</button></div><pre>' + esc(t.error) + '</pre></div>';
    }

    var atts = '';
    if (t.attachments && t.attachments.length) {
      atts = '<div class="atts">' + t.attachments.map(function(a, ai) {
        var inner, attCls = 'att', openBtn = '';
        if (a.isImage) {
          inner = '<img class="att-img" src="' + a.src + '" alt="' + esc(a.label) + '" data-lb>';
        } else if (a.isHtml) {
          attCls = 'att att-html';
          inner = '<iframe class="att-iframe" srcdoc="' + esc(a.body) + '" sandbox="allow-same-origin"></iframe>';
          openBtn = '<button class="att-open" data-tid="' + t.id + '" data-ai="' + ai + '">↗</button>';
        } else {
          inner = '<div class="att-txt">' + esc(a.body) + (a.body && a.body.length >= 4000 ? '\n…' : '') + '</div>';
        }
        return '<div class="' + attCls + '"><div class="att-lbl">' + ATT_ICON + esc(a.label) + openBtn + '</div>' + inner + '</div>';
      }).join('') + '</div>';
    }

    var hasDetail = steps || errBlock || atts;

    return '<div class="tr" data-status="' + t.status + '" data-id="' + t.id + '">'
      + '<div class="ts">'
      + '<span class="dot ' + cls + '"></span>'
      + '<span class="tname">' + esc(t.title) + '</span>'
      + '<span class="tdur">' + fmt(t.duration) + '</span>'
      + '<div class="dbar-w"><div class="dbar ' + cls + '" style="width:' + t.durPct + '%"></div></div>'
      + (hasDetail ? EXI : '<span style="width:13px;flex-shrink:0"></span>')
      + '</div>'
      + (hasDetail ? '<div class="td">' + steps + errBlock + atts + '</div>' : '')
      + '</div>';
  }

  function groupBy(tests) {
    var map = [];
    var idx = {};
    tests.forEach(function(t) {
      var s = t.suite || '(root)';
      if (!(s in idx)) { idx[s] = map.length; map.push({ name: s, tests: [] }); }
      map[idx[s]].tests.push(t);
    });
    return map;
  }

  function renderGroups(filtered) {
    var container = document.getElementById('groups');
    var empty = document.getElementById('empty');
    if (!filtered.length) {
      container.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var groups = groupBy(filtered);
    container.innerHTML = groups.map(function(g) {
      var passed  = g.tests.filter(function(t){return t.status==='passed';}).length;
      var failed  = g.tests.filter(function(t){return t.status==='failed';}).length;
      var skipped = g.tests.filter(function(t){return t.status==='skipped';}).length;
      var dur     = g.tests.reduce(function(a,b){return a+b.duration;},0);

      var badges = '';
      if (failed)  badges += '<span class="gbadge fail">'  + failed  + ' failed</span>';
      if (passed)  badges += '<span class="gbadge pass">'  + passed  + ' passed</span>';
      if (skipped) badges += '<span class="gbadge skip">'  + skipped + ' skipped</span>';
      badges += '<span class="gbadge total">' + g.tests.length + ' total</span>';

      var startOpen = failed > 0;
      return '<div class="group' + (failed ? ' has-fail' : '') + '">'
        + '<div class="gh">' + (startOpen ? CHEV : CHEV.replace('chev open','chev')) + '<span class="gname">' + esc(g.name) + '</span>'
        + '<div class="gbadges">' + badges + '</div>'
        + '<span class="gdur">' + fmt(dur) + '</span></div>'
        + '<div class="gbody"' + (startOpen ? '' : ' style="display:none"') + '>' + g.tests.map(renderTest).join('') + '</div>'
        + '</div>';
    }).join('');

    wireEvents();
  }

  function wireEvents() {
    // expand/collapse test detail
    document.querySelectorAll('.ts').forEach(function(el) {
      el.addEventListener('click', function() {
        var row = el.closest('.tr');
        var detail = row && row.querySelector('.td');
        if (!detail) return;
        var icon = el.querySelector('.exi');
        var open = detail.classList.toggle('open');
        if (icon) icon.classList.toggle('open', open);
      });
    });

    // copy error
    document.querySelectorAll('.copy-btn[data-tid]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var t = DATA.find(function(d){ return d.id === parseInt(btn.dataset.tid); });
        if (!t || !t.error) return;
        navigator.clipboard.writeText(t.error).then(function() {
          btn.textContent = 'Copied!';
          setTimeout(function(){ btn.textContent = 'Copy'; }, 1500);
        });
      });
    });

    // image lightbox
    document.querySelectorAll('[data-lb]').forEach(function(img) {
      img.addEventListener('click', function(ev) {
        ev.stopPropagation();
        document.getElementById('lbi').src = img.src;
        document.getElementById('lb').style.display = 'flex';
      });
    });

    // open HTML attachment in new tab
    document.querySelectorAll('.att-open[data-tid]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        var t = DATA.find(function(d) { return d.id === parseInt(btn.dataset.tid); });
        var a = t && t.attachments[parseInt(btn.dataset.ai)];
        if (!a || !a.body) return;
        var blob = new Blob([a.body], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
      });
    });

    // auto-expand failed tests
    document.querySelectorAll('.tr[data-status="failed"]').forEach(function(row) {
      var detail = row.querySelector('.td');
      var icon   = row.querySelector('.exi');
      if (detail) detail.classList.add('open');
      if (icon)   icon.classList.add('open');
    });
  }

  // step-group toggle (event delegation — survives re-renders)
  document.addEventListener('click', function(ev) {
    var hdr = ev.target.closest && ev.target.closest('.step-group-hdr');
    if (!hdr) return;
    var group = hdr.closest('.step-group');
    if (group) group.classList.toggle('open');
  });

  // group collapse (event delegation — survives re-renders)
  document.addEventListener('click', function(ev) {
    var gh = ev.target.closest && ev.target.closest('.gh');
    if (!gh) return;
    var body  = gh.nextElementSibling;
    var chev  = gh.querySelector('.chev');
    var isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : '';
    if (chev) chev.classList.toggle('open', !isOpen);
  });

  // expand/collapse all suites
  document.getElementById('expand-all').addEventListener('click', function() {
    document.querySelectorAll('.gbody').forEach(function(b) { b.style.display = ''; });
    document.querySelectorAll('.chev').forEach(function(c) { c.classList.add('open'); });
  });
  document.getElementById('collapse-all').addEventListener('click', function() {
    document.querySelectorAll('.gbody').forEach(function(b) { b.style.display = 'none'; });
    document.querySelectorAll('.chev').forEach(function(c) { c.classList.remove('open'); });
  });

  // filter buttons
  document.querySelectorAll('.fb').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.fb').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.f;
      refresh();
    });
  });

  // search
  var searchEl = document.getElementById('s');
  var clearBtn = document.getElementById('sx');
  searchEl.addEventListener('input', function() {
    query = searchEl.value;
    if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
    refresh();
  });
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      searchEl.value = ''; query = '';
      clearBtn.classList.remove('visible');
      refresh();
    });
  }

  // jump to failures
  var jumpBtn = document.getElementById('jf');
  if (jumpBtn) {
    jumpBtn.addEventListener('click', function() {
      document.querySelectorAll('.fb').forEach(function(b){
        b.classList.toggle('active', b.dataset.f === 'failed');
      });
      activeFilter = 'failed';
      refresh();
      var firstFail = document.querySelector('.group.has-fail');
      if (firstFail) firstFail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // lightbox close
  var lb = document.getElementById('lb');
  document.getElementById('lbc').addEventListener('click', function() { lb.style.display = 'none'; });
  lb.addEventListener('click', function(ev) {
    if (ev.target === lb) lb.style.display = 'none';
  });
  document.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') lb.style.display = 'none';
  });

  function getFiltered() {
    return DATA.filter(function(t) {
      var fOk = activeFilter === 'all' || t.status === activeFilter;
      var qOk = !query || t.fullTitle.toLowerCase().indexOf(query.toLowerCase()) >= 0;
      return fOk && qOk;
    });
  }

  function refresh() { renderGroups(getFiltered()); }

  refresh();
}());
