var currentSlide=0;
var slideInterval=null;
var isSlideAnimating=false;
var lastNotifId=localStorage.getItem('lastNotifId')||null;
var notifPollStarted=false;

function showToast(message, type='success') {
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<div class="toast-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>') + '</svg></div><span class="toast-message">' + message + '</span>';
  container.appendChild(toast);
  anime({ targets: toast, translateX: [100, 0], opacity: [0, 1], duration: 400, easing: 'easeOutCubic' });
  setTimeout(function() {
    anime({ targets: toast, translateX: 100, opacity: 0, duration: 300, easing: 'easeInCubic', complete: function() { toast.remove(); } });
  }, 4500);
}

function showBroadcastToast(username, productName, productImage) {
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast broadcast';
  var imgHtml = productImage ? '<img src="' + productImage + '" alt="" class="toast-product-img" onerror="this.style.display=\'none\'">' : '';
  toast.innerHTML = '<div class="toast-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg></div>'
    + imgHtml
    + '<div class="toast-broadcast-body"><span class="toast-broadcast-name">' + username + '</span><span class="toast-message">berhasil membeli <b>' + productName + '</b></span></div>';
  container.appendChild(toast);
  anime({ targets: toast, translateX: [120, 0], opacity: [0, 1], duration: 500, easing: 'easeOutBack' });
  setTimeout(function() {
    anime({ targets: toast, translateX: 120, opacity: 0, duration: 350, easing: 'easeInCubic', complete: function() { toast.remove(); } });
  }, 5000);
}

function updateTicker(data) {
  var track = document.getElementById('tickerTrack');
  if (!track || !data || !data.length) return;
  var items = data.slice(0, 10).map(function(n) {
    return '<span class="ticker-item"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg><b>' + n.username + '</b> beli <em>' + n.productName + '</em></span><span class="ticker-sep">•</span>';
  }).join('');
  track.innerHTML = '<div class="ticker-scroll">' + items + items + '</div>';
}

function pollNotifications() {
  fetch('/api/notifications').then(function(r){ return r.json(); }).then(function(data) {
    updateTicker(data);
    if (!data || !data.length) return;
    var latest = data[0];
    if (!lastNotifId) {
      lastNotifId = latest.id;
      localStorage.setItem('lastNotifId', lastNotifId);
      return;
    }
    var newOnes = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === lastNotifId) break;
      newOnes.push(data[i]);
    }
    if (newOnes.length) {
      lastNotifId = newOnes[0].id;
      localStorage.setItem('lastNotifId', lastNotifId);
      newOnes.reverse().forEach(function(n, idx) {
        setTimeout(function() {
          showBroadcastToast(n.username, n.productName, n.productImage);
        }, idx * 700);
      });
    }
  }).catch(function(){});
}

function openSidebar(){
  var sidebar=document.getElementById('contactSidebar');
  var overlay=document.getElementById('sidebarOverlay');
  if(sidebar) {
    sidebar.classList.add('open');
    anime({ targets: sidebar, translateX: ['100%', 0], duration: 350, easing: 'easeOutCubic' });
  }
  if(overlay)overlay.classList.add('open');
  document.body.style.overflow='hidden';
}

function closeSidebar(){
  var sidebar=document.getElementById('contactSidebar');
  var overlay=document.getElementById('sidebarOverlay');
  if(sidebar) {
    anime({ targets: sidebar, translateX: [0, '100%'], duration: 300, easing: 'easeInCubic', complete: function() { sidebar.classList.remove('open'); } });
  }
  if(overlay)overlay.classList.remove('open');
  document.body.style.overflow='';
}

function changeSlide(dir){
  var slides=document.querySelectorAll('.hero-slide');
  var dots=document.querySelectorAll('.slider-dot');
  if(!slides.length || isSlideAnimating)return;
  isSlideAnimating=true;
  var current=slides[currentSlide];
  var nextIndex=(currentSlide+dir+slides.length)%slides.length;
  var next=slides[nextIndex];
  currentSlide=nextIndex;
  anime({
    targets: current,
    opacity: 0,
    scale: [1, 1.05],
    duration: 400,
    easing: 'easeOutCubic',
    complete: function(){current.classList.remove('active');isSlideAnimating=false;}
  });
  next.classList.add('active');
  anime({
    targets: next,
    opacity: [0, 1],
    scale: [0.95, 1],
    duration: 400,
    easing: 'easeOutCubic'
  });
  if(dots.length){
    dots.forEach(function(d,i){d.classList.toggle('active',i===currentSlide);});
  }
  if(slideInterval){
    clearInterval(slideInterval);
    slideInterval=setInterval(function(){changeSlide(1);},3000);
  }
}

function goToSlide(idx){
  if(idx===currentSlide || isSlideAnimating)return;
  var slides=document.querySelectorAll('.hero-slide');
  var dots=document.querySelectorAll('.slider-dot');
  if(!slides.length)return;
  isSlideAnimating=true;
  var current=slides[currentSlide];
  var next=slides[idx];
  currentSlide=idx;
  anime({
    targets: current,
    opacity: 0,
    scale: [1, 1.05],
    duration: 400,
    easing: 'easeOutCubic',
    complete: function(){current.classList.remove('active');isSlideAnimating=false;}
  });
  next.classList.add('active');
  anime({
    targets: next,
    opacity: [0, 1],
    scale: [0.95, 1],
    duration: 400,
    easing: 'easeOutCubic'
  });
  if(dots.length){
    dots.forEach(function(d,i){d.classList.toggle('active',i===currentSlide);});
  }
  if(slideInterval){
    clearInterval(slideInterval);
    slideInterval=setInterval(function(){changeSlide(1);},3000);
  }
}

function slideBanner(dir){changeSlide(dir);}

function slideBannerTo(idx){
  if(isSlideAnimating)return;
  var slides=document.querySelectorAll('.hero-slide');
  var dots=document.querySelectorAll('.slider-dot');
  if(!slides.length||idx<0||idx>=slides.length)return;
  if(idx===currentSlide)return;
  isSlideAnimating=true;
  var current=slides[currentSlide];
  var next=slides[idx];
  currentSlide=idx;
  anime({
    targets:current,
    opacity:0,
    scale:[1,1.05],
    duration:400,
    easing:'easeOutCubic',
    complete:function(){current.classList.remove('active');isSlideAnimating=false;}
  });
  next.classList.add('active');
  anime({
    targets:next,
    opacity:[0,1],
    scale:[0.95,1],
    duration:400,
    easing:'easeOutCubic'
  });
  if(dots.length){
    dots.forEach(function(d,i){d.classList.toggle('active',i===currentSlide);});
  }
  if(slideInterval){
    clearInterval(slideInterval);
    slideInterval=setInterval(function(){changeSlide(1);},3000);
  }
}

function updateSlider(){
  var slides=document.querySelectorAll('.hero-slide');
  var dots=document.querySelectorAll('.slider-dot');
  slides.forEach(function(s,i){s.classList.toggle('active',i===currentSlide);});
  dots.forEach(function(d,i){d.classList.toggle('active',i===currentSlide);});
}

function filterCategory(cat){
  document.querySelectorAll('.category-tab').forEach(function(t){
    t.classList.toggle('active',t.dataset.category===cat);
  });
  document.querySelectorAll('.category-section').forEach(function(el){
    if(cat==='all'){el.style.display='';}
    else{el.style.display=el.dataset.category===cat?'':'none';}
  });
  anime({ targets: '.category-section', opacity: [0.5, 1], translateY: [10, 0], duration: 400, delay: anime.stagger(50) });
}

function filterProducts(){
  var input=document.getElementById('searchInput');
  if(!input)return;
  var q=input.value.toLowerCase();
  var clr=document.getElementById('searchClear');
  if(clr)clr.style.display=q?'flex':'none';
  document.querySelectorAll('.product-card').forEach(function(c){
    var nm=c.dataset.name||'';
    c.style.display=nm.includes(q)?'':'none';
  });
}

function clearSearch(){
  var inp=document.getElementById('searchInput');
  if(inp){inp.value='';filterProducts();}
}

document.addEventListener('DOMContentLoaded',function(){
  pollNotifications();
  setInterval(pollNotifications, 8000);

  var slides=document.querySelectorAll('.hero-slide');
  if(slides.length>1){
    slideInterval=setInterval(function(){changeSlide(1);},3000);
  }

  var ham=document.getElementById('navHamburger');
  var mob=document.getElementById('mobileMenu');
  if(ham&&mob){
    ham.addEventListener('click',function(){
      mob.classList.toggle('open');
      anime({ targets: mob, opacity: [0, 1], translateY: [-10, 0], duration: 250 });
    });
  }

  document.addEventListener('keydown',function(e){
    if(e.key==='Escape')closeSidebar();
  });

  var animatedCards=document.querySelectorAll('.product-card.fade-in');
  if('IntersectionObserver' in window){
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          anime({ targets: entry.target, opacity: [0, 1], translateY: [20, 0], duration: 500, easing: 'easeOutCubic' });
          observer.unobserve(entry.target);
        }
      });
    },{threshold:0.1,rootMargin:'0px 0px -40px 0px'});

    animatedCards.forEach(function(el){
      el.style.opacity='0';
      el.style.transform='translateY(20px)';
      observer.observe(el);
    });
  }else{
    animatedCards.forEach(function(el){
      el.style.opacity='1';
      el.style.transform='translateY(0)';
    });
  }

  anime({ targets: '.nav-main', translateY: [-50, 0], opacity: [0, 1], duration: 500, easing: 'easeOutCubic' });
  anime({ targets: '.hero-slider', opacity: [0, 1], translateY: [30, 0], duration: 600, delay: 200, easing: 'easeOutCubic' });
  anime({ targets: '.marquee-bar', opacity: [0, 1], translateX: [-30, 0], duration: 500, delay: 300, easing: 'easeOutCubic' });
  anime({ targets: '.search-section', opacity: [0, 1], translateY: [20, 0], duration: 400, delay: 400, easing: 'easeOutCubic' });
  anime({ targets: '.category-tabs', opacity: [0, 1], translateY: [20, 0], duration: 400, delay: 450, easing: 'easeOutCubic' });

  anime({ targets: '.card', translateY: [20, 0], opacity: [0, 1], duration: 400, delay: anime.stagger(100), easing: 'easeOutCubic' });
  anime({ targets: '.btn', scale: [0.95, 1], opacity: [0, 1], duration: 300, delay: anime.stagger(50), easing: 'easeOutCubic' });

  document.querySelectorAll('.product-card').forEach(function(card) {
    card.addEventListener('mouseenter', function() {
      anime({ targets: card, scale: 1.03, duration: 200, easing: 'easeOutCubic' });
    });
    card.addEventListener('mouseleave', function() {
      anime({ targets: card, scale: 1, duration: 200, easing: 'easeOutCubic' });
    });
  });

  var statCards = document.querySelectorAll('.admin-stats .stat-card');
  if (statCards.length > 0) {
    anime({ targets: statCards, translateY: [30, 0], opacity: [0, 1], duration: 500, delay: anime.stagger(100), easing: 'easeOutCubic' });
  }

  var tabBtns = document.querySelectorAll('.tab-btn');
  if (tabBtns.length > 0) {
    anime({ targets: tabBtns, translateY: [-10, 0], opacity: [0, 1], duration: 400, delay: anime.stagger(50), easing: 'easeOutCubic' });
  }
});

(function() {
  var canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particles = [];
  var mouseX = -1000, mouseY = -1000;
  var particleCount = window.innerWidth < 768 ? 40 : 70;
  var connectionDistance = 150;
  var mouseDistance = 200;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (var i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.3
    });
  }

  document.addEventListener('mousemove', function(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  document.addEventListener('mouseleave', function() {
    mouseX = -1000;
    mouseY = -1000;
  });

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba('#facc15', p.alpha);
      ctx.fill();

      if (mouseX > 0 && mouseY > 0) {
        var dx = mouseX - p.x;
        var dy = mouseY - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouseDistance) {
          var opacity = (1 - dist / mouseDistance) * 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouseX, mouseY);
          ctx.strokeStyle = hexToRgba('#facc15', opacity * 0.5);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var p1 = particles[i];
        var p2 = particles[j];
        var dx = p1.x - p2.x;
        var dy = p1.y - p2.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < connectionDistance) {
          var opacity = (1 - dist / connectionDistance) * 0.3;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = hexToRgba('#facc15', opacity);
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }
  draw();
})();