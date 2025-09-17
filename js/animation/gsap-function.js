document.addEventListener("DOMContentLoaded", () => {
  gsap.registerPlugin(ScrollTrigger);

  const animationSettings = {
    duration: 0.6,
    ease: "power2.out",
    stagger: 0.05
  };

  gsap.config({
    force3D: true,
    nullTargetWarn: false
  });

  ScrollTrigger.config({
    ignoreMobileResize: true,
    syncInterval: 60
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.globalTimeline.timeScale(0);
    ScrollTrigger.getAll().forEach(trigger => trigger.disable());
  }

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (e.matches) {
      gsap.globalTimeline.timeScale(0);
      ScrollTrigger.getAll().forEach(trigger => trigger.disable());
    } else {
      gsap.globalTimeline.timeScale(1);
      ScrollTrigger.getAll().forEach(trigger => trigger.enable());
    }
  });

  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    gsap.defaults({
      duration: 0.4,
      ease: "power2.out"
    });
  }

  function initHeroAnimations() {
    const tl = gsap.timeline({ delay: 0.2 });
    
    tl.fromTo("#home h1", 
      { 
        opacity: 0, 
        y: 20 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.5, 
        ease: "power2.out" 
      }
    )
    .fromTo("#home p", 
      { 
        opacity: 0, 
        y: 15 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.4, 
        ease: "power2.out" 
      }, 
      "-=0.2"
    )
    .fromTo("#home .flex.gap-3 a", 
      { 
        opacity: 0, 
        y: 10 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.2, 
        ease: "power2.out",
        stagger: 0.03 
      }, 
      "-=0.05"
    )
    .fromTo("#home .flex-wrap.gap-3", 
      { 
        opacity: 0, 
        y: 10 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.3, 
        ease: "power2.out" 
      }, 
      "-=0.05"
    );

    gsap.fromTo("#home .relative.rounded-3xl", 
      { 
        opacity: 0, 
        y: 40, 
        scale: 0.9 
      },
      { 
        opacity: 1, 
        y: 0, 
        scale: 1, 
        duration: 0.8, 
        ease: "power2.out",
        delay: 1.2 
      }
    );
  }

  function initFeaturesAnimations() {
    return;
  }

  function initPricingAnimations() {
    gsap.fromTo("#pricing .text-center h2", 
      { 
        opacity: 0, 
        y: 20 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.6, 
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#pricing .text-center",
          start: "top 80%",
          end: "bottom 20%",
          toggleActions: "play none none none"
        }
      }
    );

    gsap.fromTo("#pricing .grid .group", 
      { 
        opacity: 0, 
        y: 20 
      },
      { 
        opacity: 1, 
        y: 0,
        duration: 0.5, 
        ease: "power2.out",
        stagger: 0.1,
        scrollTrigger: {
          trigger: "#pricing .grid",
          start: "top 70%",
          end: "bottom 30%",
          toggleActions: "play none none none"
        }
      }
    );
  }

  function initAppsAnimations() {
    gsap.fromTo("#apps h2", 
      { 
        opacity: 0, 
        y: 20 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.6, 
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#apps h2",
          start: "top 80%",
          end: "bottom 20%",
          toggleActions: "play none none none"
        }
      }
    );

    gsap.fromTo("#apps .grid .rounded-2xl", 
      { 
        opacity: 0, 
        y: 15 
      },
      { 
        opacity: 1, 
        y: 0,
        duration: 0.5, 
        ease: "power2.out",
        stagger: 0.05,
        scrollTrigger: {
          trigger: "#apps .grid",
          start: "top 70%",
          end: "bottom 30%",
          toggleActions: "play none none none"
        }
      }
    );
  }

  function initFAQAnimations() {
    gsap.fromTo("#faq h2", 
      { 
        opacity: 0, 
        y: 20 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.6, 
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#faq h2",
          start: "top 80%",
          end: "bottom 20%",
          toggleActions: "play none none none"
        }
      }
    );

    gsap.fromTo("#faq .py-4", 
      { 
        opacity: 0, 
        y: 10 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.4, 
        ease: "power2.out",
        stagger: 0.05,
        scrollTrigger: {
          trigger: "#faq .divide-y",
          start: "top 70%",
          end: "bottom 30%",
          toggleActions: "play none none none"
        }
      }
    );
  }

  function initDashboardPreviewAnimations() {
    gsap.fromTo("#dashboard-preview h2", 
      { 
        opacity: 0, 
        y: 40 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 1.2, 
        ease: "power1.out",
        scrollTrigger: {
          trigger: "#dashboard-preview h2",
          start: "top 85%",
          end: "bottom 15%",
          toggleActions: "play none none none"
        }
      }
    );

    gsap.fromTo("#dashboard-preview p", 
      { 
        opacity: 0, 
        y: 30 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 1.0, 
        ease: "power1.out",
        scrollTrigger: {
          trigger: "#dashboard-preview p",
          start: "top 80%",
          end: "bottom 20%",
          toggleActions: "play none none none"
        }
      }
    );

    gsap.fromTo("#dashboard-preview .flex.gap-3", 
      { 
        opacity: 0, 
        y: 25 
      },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.8, 
        ease: "power1.out",
        stagger: 0.2,
        scrollTrigger: {
          trigger: "#dashboard-preview .flex.gap-3",
          start: "top 75%",
          end: "bottom 25%",
          toggleActions: "play none none none"
        }
      }
    );

    gsap.fromTo("#dashboard-preview .order-1.lg\\:order-2", 
      { 
        opacity: 0, 
        x: 50, 
        scale: 0.95 
      },
      { 
        opacity: 1, 
        x: 0, 
        scale: 1, 
        duration: 1.5, 
        ease: "power1.out",
        scrollTrigger: {
          trigger: "#dashboard-preview .order-1.lg\\:order-2",
          start: "top 70%",
          end: "bottom 30%",
          toggleActions: "play none none none"
        }
      }
    );
  }

  function initButtonAnimations() {
    document.querySelectorAll("a, button").forEach(button => {
      button.addEventListener("mouseenter", () => {
        gsap.to(button, {
          scale: 1.02,
          duration: 0.2,
          ease: "power2.out"
        });
      });
      
      button.addEventListener("mouseleave", () => {
        gsap.to(button, {
          scale: 1,
          duration: 0.2,
          ease: "power2.out"
        });
      });
    });
  }

  function initNavigationAnimations() {
    const header = document.querySelector("header");
    
    gsap.fromTo(header, 
      { 
        y: -20, 
        opacity: 0 
      },
      { 
        y: 0, 
        opacity: 1, 
        duration: 0.5, 
        ease: "power2.out" 
      }
    );
  }

  function initParticlesAnimation() {
    const particles = document.getElementById("particles-js");
    if (particles) {
      gsap.fromTo(particles, 
        { 
          opacity: 0 
        },
        { 
          opacity: 1, 
          duration: 0.8, 
          ease: "power2.out",
          delay: 0.5 
        }
      );
    }
  }

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href').slice(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          e.preventDefault();
          
          gsap.to(window, {
            duration: 1,
            scrollTo: {
              y: targetElement,
              offsetY: 80
            },
            ease: "power2.inOut"
          });
        }
      });
    });
  }

  const observerOptions = {
    root: null,
    rootMargin: '50px',
    threshold: 0.1
  };

  const animationObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        if (element.dataset.animate) {
          const animationType = element.dataset.animate;
          switch(animationType) {
            case 'fadeIn':
              gsap.fromTo(element, 
                { opacity: 0, y: 30 }, 
                { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }
              );
              break;
            case 'slideInLeft':
              gsap.fromTo(element, 
                { opacity: 0, x: -50 }, 
                { opacity: 1, x: 0, duration: 0.8, ease: "power2.out" }
              );
              break;
            case 'slideInRight':
              gsap.fromTo(element, 
                { opacity: 0, x: 50 }, 
                { opacity: 1, x: 0, duration: 0.8, ease: "power2.out" }
              );
              break;
          }
          animationObserver.unobserve(element);
        }
      }
    });
  }, observerOptions);

  document.querySelectorAll('[data-animate]').forEach(el => {
    animationObserver.observe(el);
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 250);
  });

  const criticalElements = document.querySelectorAll('#home h1, #home p, #home .flex.gap-3');
  criticalElements.forEach(el => {
    gsap.set(el, { willChange: 'transform, opacity' });
  });

  function initAllAnimations() {
    initHeroAnimations();
    initFeaturesAnimations();
    initPricingAnimations();
    initAppsAnimations();
    initFAQAnimations();
    initDashboardPreviewAnimations();
    initButtonAnimations();
    initNavigationAnimations();
    initParticlesAnimation();
    initSmoothScroll();
  }

  initAllAnimations();

  window.addEventListener('resize', () => {
    ScrollTrigger.refresh();
  });

  window.addEventListener('beforeunload', () => {
    ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    gsap.killTweensOf("*");
  });
});