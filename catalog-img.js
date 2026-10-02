// TechGuide — catalog-img.js  [v1.63 · fotos reescaladas con IA en v1.72]
// RUTAS, no base64. Antes este archivo pesaba 904 KB porque traia las 82
// fotos embebidas como data-URI: el telefono bajaba TODAS aunque el asesor
// solo viera ocho. Ahora son archivos WebP sueltos en img/ (320 KB en total,
// 3.9 KB cada una) y el navegador baja unicamente las que se pintan.
// El contrato no cambia: IMG[id] sigue siendo una cadena que va directo a
// un src, asi que los consumidores de app.js, index.html y catalogo.html
// siguen funcionando sin tocarse.
// [v1.72] Las rutas llevan ?v=20261001: las fotos nuevas tienen el MISMO nombre que las
// anteriores, y el service worker sirve las fotos desde cache sin volver a
// preguntar. Sin la version, los asesores seguirian viendo las viejas.
// Debe coincidir con IMG_BUILD en sw.js.
window.IMG = {
  "ss26fe":"img/ss26fe.webp?v=20261001",
  "hx7e":"img/hx7e.webp?v=20261001",
  "ip18promax_512":"img/ip18promax.webp?v=20261001",
  "ip18promax":"img/ip18promax.webp?v=20261001",
  "ip18pro_512":"img/ip18pro.webp?v=20261001",
  "ip18pro":"img/ip18pro.webp?v=20261001",
  "h400":"img/h400.webp?v=20261001",
  "h400bal":"img/h400bal.webp?v=20261001",
  "hmagic7px8c":"img/hmagic7px8c.webp?v=20261001",
  "hmagic8lite":"img/hmagic8lite.webp?v=20261001",
  "hmagic8litejersey":"img/hmagic8litejersey.webp?v=20261001",
  "hmagic8pro":"img/hmagic8pro.webp?v=20261001",
  "honor600":"img/honor600.webp?v=20261001",
  "hx5c":"img/hx5c.webp?v=20261001",
  "hx5d":"img/hx5d.webp?v=20261001",
  "hx6c":"img/hx6c.webp?v=20261001",
  "hx7d":"img/hx7d.webp?v=20261001",
  "hx8d":"img/hx8d.webp?v=20261001",
  "ip15":"img/ip15.webp?v=20261001",
  "ip16":"img/ip16.webp?v=20261001",
  "ip16promax":"img/ip16promax.webp?v=20261001",
  "ip17":"img/ip17.webp?v=20261001",
  "ip17_512":"img/ip17_512.webp?v=20261001",
  "ip17e":"img/ip17e.webp?v=20261001",
  "ip17pro":"img/ip17pro.webp?v=20261001",
  "ip17pro_512":"img/ip17pro_512.webp?v=20261001",
  "ip17promax":"img/ip17promax.webp?v=20261001",
  "ip17promax_512":"img/ip17promax_512.webp?v=20261001",
  "medge60f":"img/medge60f.webp?v=20261001",
  "medge60pro":"img/medge60pro.webp?v=20261001",
  "medge60pro_w":"img/medge60pro_w.webp?v=20261001",
  "medge70":"img/medge70.webp?v=20261001",
  "medge70f_npi":"img/medge70f_npi.webp?v=20261001",
  "medge70pro_w":"img/medge70pro_w.webp?v=20261001",
  "medge70pro_wc":"img/medge70pro_wc.webp?v=20261001",
  "mg06":"img/mg06.webp?v=20261001",
  "mg17":"img/mg17.webp?v=20261001",
  "mg56":"img/mg56.webp?v=20261001",
  "mg77":"img/mg77.webp?v=20261001",
  "mrazr60u":"img/mrazr60u.webp?v=20261001",
  "opa5":"img/opa5.webp?v=20261001",
  "opa58":"img/opa58.webp?v=20261001",
  "opa5pro4g":"img/opa5pro4g.webp?v=20261001",
  "opa5pro5g":"img/opa5pro5g.webp?v=20261001",
  "opa6":"img/opa6.webp?v=20261001",
  "opa6k":"img/opa6k.webp?v=20261001",
  "opa6t":"img/opa6t.webp?v=20261001",
  "opa6x":"img/opa6x.webp?v=20261001",
  "opfindx9pro":"img/opfindx9pro.webp?v=20261001",
  "opreno13":"img/opreno13.webp?v=20261001",
  "opreno14":"img/opreno14.webp?v=20261001",
  "opreno14f":"img/opreno14f.webp?v=20261001",
  "opreno16f":"img/opreno16f.webp?v=20261001",
  "px10":"img/px10.webp?v=20261001",
  "px10_256":"img/px10_256.webp?v=20261001",
  "px10pro":"img/px10pro.webp?v=20261001",
  "px10pro_512":"img/px10pro_512.webp?v=20261001",
  "px10proxl":"img/px10proxl.webp?v=20261001",
  "px10proxl_512":"img/px10proxl_512.webp?v=20261001",
  "sa07":"img/sa07.webp?v=20261001",
  "sa07_128":"img/sa07_128.webp?v=20261001",
  "sa17":"img/sa17.webp?v=20261001",
  "sa27":"img/sa27.webp?v=20261001",
  "sa37":"img/sa37.webp?v=20261001",
  "sa57":"img/sa57.webp?v=20261001",
  "ss25u":"img/ss25u.webp?v=20261001",
  "ss26":"img/ss26.webp?v=20261001",
  "ss26plus":"img/ss26plus.webp?v=20261001",
  "ss26ultra":"img/ss26ultra.webp?v=20261001",
  "ss_zflip7":"img/ss_zflip7.webp?v=20261001",
  "ss_zflip8":"img/ss_zflip8.webp?v=20261001",
  "ss_zfold7":"img/ss_zfold7.webp?v=20261001",
  "ss_zfold8":"img/ss_zfold8.webp?v=20261001",
  "ss_zfold8u":"img/ss_zfold8u.webp?v=20261001",
  "x15t":"img/x15t.webp?v=20261001",
  "x15tpro":"img/x15tpro.webp?v=20261001",
  "x17t":"img/x17t.webp?v=20261001",
  "x17tpro":"img/x17tpro.webp?v=20261001",
  "x17ultra":"img/x17ultra.webp?v=20261001",
  "xr15":"img/xr15.webp?v=20261001",
  "xr15c":"img/xr15c.webp?v=20261001",
  "xr17":"img/xr17.webp?v=20261001",
  "xra5":"img/xra5.webp?v=20261001",
  "xra7pro":"img/xra7pro.webp?v=20261001",
  "xra7promochila":"img/xra7promochila.webp?v=20261001",
  "xrn15":"img/xrn15.webp?v=20261001",
  "xrn15pro":"img/xrn15pro.webp?v=20261001",
  "xrn17sp":"img/xrn17sp.webp?v=20261001"
};

// [v1.63.1] AVISO DE QUE YA ESTAN LISTAS.
// El catalog-img.js original terminaba con esta llamada y al regenerarlo la
// perdi. Sin ella nadie repinta: initMomento() y renderFlashCard() corren ANTES
// de que este archivo cargue, se encuentran IMG vacio y dejan el icono gris
// para siempre. index.html la usa para refrescar las vistas visibles.
try{ if(typeof window._onCatalogImgReady === 'function') window._onCatalogImgReady(); }catch(e){}
