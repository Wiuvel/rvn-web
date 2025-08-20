function openHiddify() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    window.location.href = "https://apps.apple.com/us/app/hiddify-proxy-vpn/id6596777532";
  } else if (/android/i.test(ua)) {
    window.location.href = "https://play.google.com/store/apps/details?id=app.hiddify.com";
  } else {
    alert("Откройте страницу с телефона, чтобы скачать приложение.");
  }
}

function openV2rayTun() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
    window.location.href = "https://apps.apple.com/us/app/v2raytun/id6476628951";
  } else if (/android/i.test(ua)) {
    window.location.href = "https://play.google.com/store/apps/details?id=com.v2raytun.android";
  } else {
    alert("Откройте страницу с телефона, чтобы скачать приложение.");
  }
}

window.openHiddify = openHiddify;
window.openV2rayTun = openV2rayTun;
