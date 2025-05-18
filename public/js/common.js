const modalLoading = new bootstrap.Modal('#modalLoading')

function cleanPDF(pdf) {
    let pagesRef = [];
    for(page of pdf.getPages()) {
        pagesRef.push(page.ref.tag)
    }

    let hasPageDeleted = false;
    //Supprime les objets pages qui on été supprimés
    for(d of pdf.pageMap.entries()) {
        for(p of d) {
            if(p.ref) {
                if(!pagesRef.includes(p.ref.tag)) {
                    hasPageDeleted = true;
                    pdf.context.indirectObjects.delete(window['PDFLib'].PDFRef.of(p.ref.objectNumber));
                }
            }
        }
    }

    if(! hasPageDeleted) {
        return;
    }

    //Supprime les objets non utilisés tant qu'il y en a
    let tagsToDelete = [];
    do {
        tagsToDelete = [];
        let tags = [];
        tags.push(pdf.context.trailerInfo.Info.tag);
        tags.push(pdf.context.trailerInfo.Root.tag);
        tags.concat(getPDFTags(pdf.catalog));
        pdf.context.indirectObjects.forEach(function(object) {
            tags = tags.concat(getPDFTags(object));
        });
        for(p of pdf.getPages()) {
            tags = tags.concat(getPDFTags(p.node));
        }
        for(o of pdf.context.enumerateIndirectObjects()) {
            for(e of o) {
                if(e.tag && !tags.includes(e.tag)) {
                    tagsToDelete.push(e.tag);
                    //console.log(e.objectNumber);
                    //console.log(pdf.context.indirectObjects.get(window['PDFLib'].PDFRef.of(e.objectNumber)));
                    pdf.context.indirectObjects.delete(window['PDFLib'].PDFRef.of(e.objectNumber))
                }
            }
        }
    } while(tagsToDelete.length);
}

function getPDFTags(node) {
    let tags = [];

    if(node.tag) {
        tags.push(node.tag);
    }
    if(node.array) {
        for(item of node.array) {
            tags = tags.concat(getPDFTags(item));
        }
    }
    if(node.dict) {
        for(dict of node.dict.entries()) {
            for(object of dict) {
                tags = tags.concat(getPDFTags(object));
            }
        }
    }
    return tags;
}

async function saveAllNoDownload() {
  let order = [];
  let selectionMode = typeof isSelectionMode === "function" && isSelectionMode();

  document.querySelectorAll('.canvas-container').forEach(function(canvasContainer) {
    let checkbox = selectionMode
      ? canvasContainer.querySelector('.input-select')
      : canvasContainer.querySelector('.checkbox-page');

    let inputRotate = canvasContainer.querySelector('.input-rotate');
    let pageValue = "";

    if (checkbox?.checked) {
      pageValue = checkbox.value;
    }

    let orientation = inputRotate?.value;
    if (pageValue && orientation) {
      pageValue = pageValue + "-" + orientation;
    }
    if (pageValue) {
      order.push(pageValue);
    }
  });

  const inputPagesEl = document.querySelector('#input_pages');
  if (inputPagesEl) {
    inputPagesEl.value = order.join(',');
  }

  await saveWithoutDownload(order.join(','));
}


async function saveWithoutDownload(order) {
  const PDFDocument = window['PDFLib'].PDFDocument;

  // Use input_pdf OR input_pdf_upload
  const inputElement = document.querySelector('#input_pdf') || document.querySelector('#input_pdf_upload');
  if (!inputElement || !inputElement.files.length) {
    throw new Error("No PDF file selected for processing.");
  }

  const pdf = await PDFDocument.load(await inputElement.files.item(0).arrayBuffer(), {
    ignoreEncryption: true,
    password: "",
    updateMetadata: false
  });

  let filename = "";
  let pages = [];
  const pagesOrganize = order.split(',');

  for (let i = 0; i < inputElement.files.length; i++) {
    if (filename) filename += '_';
    filename += inputElement.files.item(i).name.replace(/\.pdf$/, '');
    const indices = [];
    const letter = getLetter(i);

    for (let k in pagesOrganize) {
      if (pagesOrganize[k].startsWith(letter)) {
        indices.push(parseInt(pagesOrganize[k].split('-')[0].replace(letter, '')) - 1);
      }
    }

    let pdfPages = [];
    if (i === 0) {
      pdfPages = await pdf.getPages();
      for (let j in indices) {
        pages[letter + (indices[j] + 1).toString()] = pdfPages[indices[j]];
      }
      for (let i in pdf.getPages()) {
        pdf.removePage(0);
      }
    } else {
      const pdfFile = await PDFDocument.load(await inputElement.files.item(i).arrayBuffer(), {
        ignoreEncryption: true,
        password: "",
        updateMetadata: false
      });
      pdfPages = await pdf.copyPages(pdfFile, indices);
      for (let j in pdfPages) {
        pages[letter + (indices[j] + 1).toString()] = pdfPages[j];
      }
    }
  }

  for (let i in pagesOrganize) {
    const pageOrganize = pagesOrganize[i].split('-')[0];
    const rotation = pagesOrganize[i].split('-')[1];
    const pdfPage = pages[pageOrganize];
    if (rotation) {
      pdfPage.setRotation(window['PDFLib'].degrees(parseInt(rotation)));
    }
    pdf.addPage(pdfPage);
  }

  cleanPDF(pdf);
  const newPDF = new Blob([await pdf.save()], { type: "application/pdf" });
  window.latestSignedPdfBlob = newPDF;
  window.latestSignedPdfFilename = filename + ".pdf";
}



function is_mobile() {
    return !(window.getComputedStyle(document.getElementById('is_mobile')).display === "none");
};

function hasTouch() {
    return 'ontouchstart' in document.documentElement
     || navigator.maxTouchPoints > 0
     || navigator.msMaxTouchPoints > 0;
}

function disabledHoverStyle() {
    try { // prevent exception on browsers not supporting DOM styleSheets properly
      for (var si in document.styleSheets) {
        var styleSheet = document.styleSheets[si];
        if (!styleSheet.rules) continue;

        for (var ri = styleSheet.rules.length - 1; ri >= 0; ri--) {
          if (!styleSheet.rules[ri].selectorText) continue;

          if (styleSheet.rules[ri].selectorText.match(':hover')) {
            styleSheet.deleteRule(ri);
          }
        }
      }
    } catch (ex) {}
}

async function canUseCache() {
    try {
        cache = await caches.open('pdf');
        return true;
    } catch (e) {
        return false;
    }
};

async function loadFileFromCache(cacheUrl, pageUrl) {
    if(!await canUseCache()) {
        document.location = pageUrl;
        return false;
    }
    const cache = await caches.open('pdf');
    let responsePdf = await cache.match(cacheUrl);

    if(!responsePdf) {
        return;
    }

    let filename = cacheUrl.replace('/pdf/', '');

    let pdfBlob = await responsePdf.blob();

    let dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([pdfBlob], filename, {
        type: 'application/pdf'
    }));
    document.getElementById('input_pdf_upload').files = dataTransfer.files;
}

async function storeFileInCache() {
    let cache = await caches.open('pdf');
    let filename = document.getElementById('input_pdf_upload').files[0].name;
    let response = new Response(document.getElementById('input_pdf_upload').files[0], { "status" : 200, "statusText" : "OK" });
    await cache.put('/pdf/'+filename, response);
}

async function loadFileFromUrl(url, pageUrl, local = null) {
    showLoading('Download')
    history.replaceState({}, '', pageUrl);
    let response = await fetch(url);
    if(response.status != 200) {
        return;
    }
    let pdfBlob = await response.blob();
    let file_id = url.replace(/^.*\//, '');

    if(response.headers.has('content-disposition') && response.headers.get('Content-Disposition').match(/attachment; filename="/)) {
        file_id = response.headers.get('Content-Disposition').replace(/^[^"]*"/, "").replace(/"[^"]*$/, "").replace(/_signe-[0-9]+\x.pdf/, '.pdf');
    }

    if(pdfBlob.type != 'application/pdf' && pdfBlob.type != 'application/octet-stream') {
        return;
    }
    let dataTransfer = new DataTransfer();
    if (local) {
        file_id = local;
    }
    dataTransfer.items.add(new File([pdfBlob], file_id, {
        type: 'application/pdf'
    }));
    document.getElementById('input_pdf_upload').files = dataTransfer.files;
    endLoading()
}

function startProcessingMode(btn) {
    btn.disabled = true;
    btn.querySelector('.bi').classList.add('position-relative');
    btn.querySelector('.bi').insertAdjacentHTML('afterbegin', '<span class="spinner-grow spinner-grow-sm position-absolute top-50 start-50 translate-middle"></span>');
}

function endProcessingMode(btn) {
    btn.querySelector('.spinner-grow').remove();
    btn.querySelector('.bi').classList.remove('position-relative');
    btn.disabled = false;
}

function showLoading(message) {
    document.getElementById('modalLoading').querySelector('p').innerText = message
    modalLoading.show();
}

function endLoading(message) {
    modalLoading.hide();
}

function download(blob, filename) {
    let a = document.createElement("a"),
        u = URL.createObjectURL(blob);
    a.download = filename,
    a.href = u,
    a.click(),
    setTimeout(() => URL.revokeObjectURL(u))
}

function storeSymmetricKeyCookie(hash, symmetricKey) {
    if (symmetricKey.length != 15) {
        console.error("Erreur taille cle symétrique.");
        return;
    }
    document.cookie = hash + "=" + symmetricKey + "; SameSite=Lax; Path=/;";
}

function getSymmetricKey(hash) {
    return getCookieValue(hash);
}

function getCookieValue (name) {
    return document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)')?.pop() || '';
}

function generateSymmetricKey() {
    const length = 15;
    const keySpace = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let key = '';

    for (let i = 0; i < length; ++i) {
        const randomIndex = Math.floor(Math.random() * keySpace.length);
        key += keySpace.charAt(randomIndex);
    }

    return key;
}

function generatePdfHash() {
    const length = 20;
    const keySpace = '0123456789abcdefghijklmnopqrstuvwxyz';
    let key = '';

    for (let i = 0; i < length; ++i) {
        const randomIndex = Math.floor(Math.random() * keySpace.length);
        key += keySpace.charAt(randomIndex);
    }

    return key;
}

function dataURLtoBlob(dataurl) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

function svgToDataUrl(svg) {

    return "data:image/svg+xml;base64," + btoa(svg);
}

function trimSvgWhitespace(svgContent) {
    if(!svgContent) {

        return null;
    }
    let svgContainer = document.createElement("div")
    svgContainer.classList.add('invisible');
    svgContainer.classList.add('position-absolute');
    svgContainer.classList.add('top-0');
    svgContainer.classList.add('start-0');
    svgContainer.style = "z-index: -1;";
    svgContainer.innerHTML = svgContent;
    document.body.appendChild(svgContainer);
    let svg = svgContainer.querySelector('svg');
    let box = svg.getBBox();
    svg.setAttribute("viewBox", [box.x, box.y, box.width, box.height].join(" "));
    svgContent = svgContainer.innerHTML;
    document.body.removeChild(svgContainer)

    return svgContent = svgContainer.innerHTML;
}

function getLetter(i) {
    return String.fromCharCode(96 + i+1).toUpperCase();
}

document.addEventListener("DOMContentLoaded", function () {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  const btnEncrypt = document.getElementById("btn_download_encrypt");
  const btnShare = document.getElementById("btn_encrypt_pacshare");

  if (btnEncrypt && !btnEncrypt.dataset.bound) {
    btnEncrypt.addEventListener("click", async () => {
      await saveAllNoDownload();
      const password = document.getElementById("paccrypt_enc_password")?.value?.trim();
      if (!password) return alert("Encryption password is required.");

      const fileBlob = window.latestSignedPdfBlob;
      let originalFilename = window.latestSignedPdfFilename;
      if (!fileBlob || !originalFilename) return alert("Missing signed PDF. Please click Save first.");

      const cleanFilename = originalFilename.replace(/\.pdf$/i, '');
      const finalInputFilename = cleanFilename + ".pdf";
      const suffix = Math.random().toString(36).slice(-5);
      const downloadName = `${cleanFilename}_${suffix}.pdf.encrypted`;

      const formData = new FormData();
      formData.append("file", fileBlob, finalInputFilename);
      formData.append("enc_password", password);

      try {
        const response = await fetch("http://paccrypt:5000/api/encrypt", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          return alert("Encryption failed: " + (err.error || response.statusText));
        }

        const encryptedBlob = await response.blob();
        download(encryptedBlob, downloadName);
      } catch (err) {
        console.error("Encryption error:", err);
        alert("Encryption failed.");
      }
    });
    btnEncrypt.dataset.bound = true;
  }

  if (btnShare && !btnShare.dataset.bound) {
    btnShare.addEventListener("click", async () => {
      await saveAllNoDownload();
      const password = document.getElementById("paccrypt_enc_password")?.value?.trim();
      const pickup = document.getElementById("paccrypt_pickup_password")?.value?.trim();
      if (!window.latestSignedPdfBlob || !password || !pickup) return alert("Missing fields!");

      const formData = new FormData();
      formData.append("file", window.latestSignedPdfBlob, window.latestSignedPdfFilename);
      formData.append("enc_password", password);
      formData.append("pickup_password", pickup);

      try {
        const res = await fetch("http://paccrypt:5000/api/encrypt", {
          method: "POST",
          body: formData,
        });

        let resultText = await res.text();
        let result;
        try {
          result = JSON.parse(resultText);
        } catch (err) {
          console.error("Non-JSON response:", resultText);
          return alert("Server error: " + resultText.slice(0, 200));
        }

        if (result.pickup_url) {
          await navigator.clipboard.writeText(result.pickup_url);

          const toast = document.createElement("div");
          toast.innerText = "📋 Link copied to clipboard:\n" + result.pickup_url;
          toast.style.position = "fixed";
          toast.style.bottom = "20px";
          toast.style.left = "50%";
          toast.style.transform = "translateX(-50%)";
          toast.style.padding = "10px 20px";
          toast.style.backgroundColor = "#198754";
          toast.style.color = "#fff";
          toast.style.borderRadius = "6px";
          toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
          toast.style.zIndex = 9999;
          toast.style.textAlign = "center";
          toast.style.whiteSpace = "pre-wrap";

          document.body.appendChild(toast);
          setTimeout(() => {
            toast.remove();
          }, 4000);
        } else {
          console.error("PacShare error response:", result);
          alert("Upload failed: " + (result.error || "Unknown error."));
        }
      } catch (err) {
        console.error("Fetch error:", err);
        alert("Upload failed: " + err.message);
      }
    });
    btnShare.dataset.bound = true;
  }
});




