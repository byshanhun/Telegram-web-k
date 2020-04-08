import appPhotosManager from '../lib/appManagers/appPhotosManager';
import CryptoWorker from '../lib/crypto/cryptoworker';
import LottieLoader from '../lib/lottieLoader';
import appStickersManager from "../lib/appManagers/appStickersManager";
import appDocsManager from "../lib/appManagers/appDocsManager";
import {AppImManager} from "../lib/appManagers/appImManager";
import { formatBytes } from "../lib/utils";
import ProgressivePreloader from './preloader';
import LazyLoadQueue from './lazyLoadQueue';
import apiFileManager from '../lib/mtproto/apiFileManager';
import appWebpManager from '../lib/appManagers/appWebpManager';
import {wrapPlayer} from '../lib/ckin';
import { RichTextProcessor } from '../lib/richtextprocessor';
import { CancellablePromise } from '../lib/polyfill';

export type MTDocument = {
  _: 'document',
  pFlags: any,
  flags: number,
  id: string,
  access_hash: string,
  file_reference: Uint8Array | number[],
  date: number,
  mime_type: string,
  size: number,
  thumbs: MTPhotoSize[],
  dc_id: number,
  attributes: any[],
  
  type?: string,
  h?: number,
  w?: number,
  file_name?: string,
  file?: File,
  duration?: number
};

export type MTPhotoSize = {
  _: string,
  w?: number,
  h?: number,
  size?: number,
  type?: string, // i, m, x, y, w by asc
  location?: any,
  bytes?: Uint8Array, // if type == 'i'
  
  preloaded?: boolean // custom added
};

export function wrapVideo(this: AppImManager, doc: MTDocument, container: HTMLDivElement, message: any, justLoader = true, preloader?: ProgressivePreloader, controls = true, round = false, boxWidth = 380, boxHeight = 380, withTail = false, isOut = false) {
  let img: HTMLImageElement | SVGImageElement;
  let peerID = this.peerID;

  if(withTail) {
    img = wrapMediaWithTail(doc, message, container, boxWidth, boxHeight, isOut);
  } else {
    if(!container.firstElementChild || (container.firstElementChild.tagName != 'IMG' && container.firstElementChild.tagName != 'VIDEO')) {
      let size = appPhotosManager.setAttachmentSize(doc, container, boxWidth, boxHeight);
    }
    
    img = container.firstElementChild as HTMLImageElement || new Image();
    
    if(!container.contains(img)) {
      container.append(img);
    }
  }
  
  if(!preloader) {
    preloader = new ProgressivePreloader(container, true);
  }

  let video = document.createElement('video');
  if(withTail) {
    let foreignObject = document.createElementNS("http://www.w3.org/2000/svg", 'foreignObject');
    let width = img.getAttributeNS(null, 'width');
    let height = img.getAttributeNS(null, 'height');
    foreignObject.setAttributeNS(null, 'width', width);
    foreignObject.setAttributeNS(null, 'height', height);
    video.width = +width;
    video.height = +height;
    foreignObject.append(video);
    img.parentElement.append(foreignObject);
  }

  let source = document.createElement('source');
  video.append(source);
  
  let loadVideo = () => {
    let promise = appDocsManager.downloadDoc(doc);
    
    preloader.attach(container, true, promise);
    
    return promise.then(blob => {
      if(this.peerID != peerID) {
        this.log.warn('peer changed');
        return;
      }

      //return;
      
      ///////console.log('loaded doc:', doc, blob, container);
      
      //source.src = doc.url;
      source.type = doc.mime_type;
      source.src = URL.createObjectURL(blob);
      video.append(source);

      if(!withTail) {
        if(img && container.contains(img)) {
          container.removeChild(img);
        }

        container.append(video);
      }
      
      if(!justLoader || round) {
        video.dataset.ckin = round ? 'circle' : 'default';
        video.dataset.overlay = '1';
        let wrapper = wrapPlayer(video);
        
        if(!round) {
          (wrapper.querySelector('.toggle') as HTMLButtonElement).click();
        }
      } else if(doc.type == 'gif') {
        video.autoplay = true;
        video.loop = true;
      }
    });
  };
  
  if(doc.type == 'gif' || true) { // extra fix
    return this.loadMediaQueuePush(loadVideo);
  } /* else { // if video
    let load = () => appPhotosManager.preloadPhoto(doc).then((blob) => {
      if((this.peerID ? this.peerID : this.currentMessageID) != peerID) {
        this.log.warn('peer changed');
        return;
      }
      
      img.src = URL.createObjectURL(blob);
      
      if(!justLoader) {
        return loadVideo();
      } else {
        container.style.width = '';
        container.style.height = '';
        preloader.detach();
      }
    });
    
    return this.peerID ? this.loadMediaQueuePush(load) : load();
  } */
}

export function wrapDocument(doc: MTDocument, withTime = false, uploading = false): HTMLDivElement {
  if(doc.type == 'voice') {
    return wrapAudio(doc, withTime);
  }
  
  let docDiv = document.createElement('div');
  docDiv.classList.add('document');
  
  let iconDiv = document.createElement('div');
  iconDiv.classList.add('tgico-document');
  
  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';
  
  let ext2 = ext;
  if(doc.type == 'photo') {
    docDiv.classList.add('photo');
    ext2 = `<img src="${URL.createObjectURL(doc.file)}">`;
  }
  
  let fileName = doc.file_name || 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let date = new Date(doc.date * 1000);
    
    size += ' · ' + months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear() 
    + ' at ' + date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  
  docDiv.innerHTML = `
  <div class="document-ico ext-${ext}">${ext2}</div>
  ${!uploading ? `<div class="document-download"><div class="tgico-download"></div></div>` : ''}
  <div class="document-name">${fileName}</div>
  <div class="document-size">${size}</div>
  `;
  
  if(!uploading) {
    let downloadDiv = docDiv.querySelector('.document-download') as HTMLDivElement;
    let preloader: ProgressivePreloader;
    let promise: CancellablePromise<Blob>;
    
    docDiv.addEventListener('click', () => {
      if(!promise) {
        if(downloadDiv.classList.contains('downloading')) {
          return; // means not ready yet
        }
        
        if(!preloader) {
          preloader = new ProgressivePreloader(null, true);
        }
        
        appDocsManager.saveDocFile(doc.id).then(res => {
          promise = res.promise;
          
          preloader.attach(downloadDiv, true, promise);
          
          promise.then(() => {
            downloadDiv.classList.remove('downloading');
            downloadDiv.remove();
          });
        })
        
        downloadDiv.classList.add('downloading');
      } else {
        downloadDiv.classList.remove('downloading');
        promise = null;
      }
    });
  }
  
  return docDiv;
}

let lastAudioToggle: HTMLDivElement = null;

export function wrapAudio(doc: MTDocument, withTime = false): HTMLDivElement {
  let div = document.createElement('div');
  div.classList.add('audio');
  
  let duration = doc.duration;
  
  // @ts-ignore
  let durationStr = String(duration | 0).toHHMMSS(true);
  
  div.innerHTML = `
  <div class="audio-toggle audio-ico tgico-largeplay"></div>
  <div class="audio-download"><div class="tgico-download"></div></div>
  <div class="audio-time">${durationStr}</div>
  `;
  
  //////console.log('wrapping audio', doc, doc.attributes[0].waveform);
  
  let timeDiv = div.lastElementChild as HTMLDivElement;
  
  let downloadDiv = div.querySelector('.audio-download') as HTMLDivElement;
  let preloader: ProgressivePreloader;
  let promise: CancellablePromise<Blob>;
  
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('audio-waveform');
  svg.setAttributeNS(null, 'width', '190');
  svg.setAttributeNS(null, 'height', '23');
  svg.setAttributeNS(null, 'viewBox', '0 0 190 23');
  
  div.insertBefore(svg, div.lastElementChild);
  let wave = doc.attributes[0].waveform as Uint8Array;
  
  let index = 0;
  let skipped = 0;
  for(let uint8 of wave) {
    if (index > 0 && index % 4 == 0) {
      ++index;
      ++skipped;
      continue;
    }
    let percents = uint8 / 255;
    
    let height = 23 * percents;
    if(/* !height ||  */height < 2) {
      height = 2;
    }
    
    svg.insertAdjacentHTML('beforeend', `
    <rect x="${(index - skipped) * 4}" y="${23 - height}" width="2" height="${height}" rx="1" ry="1"></rect>
    `);
    
    ++index;
  }
  
  let progress = div.querySelector('.audio-waveform') as HTMLDivElement;
  
  let onClick = () => {
    if(!promise) {
      if(downloadDiv.classList.contains('downloading')) {
        return; // means not ready yet
      }
      
      if(!preloader) {
        preloader = new ProgressivePreloader(null, true);
      }
      
      let promise = appDocsManager.downloadDoc(doc.id);
      preloader.attach(downloadDiv, true, promise);
      
      promise.then(blob => {
        downloadDiv.classList.remove('downloading');
        downloadDiv.remove();
        
        let audio = document.createElement('audio');
        let source = document.createElement('source');
        source.src = URL.createObjectURL(blob);
        source.type = doc.mime_type;
        
        audio.volume = 1;
        
        div.removeEventListener('click', onClick);
        let toggle = div.querySelector('.audio-toggle') as HTMLDivElement;
        
        let interval = 0;
        let lastIndex = 0;
        
        toggle.addEventListener('click', () => {
          if(audio.paused) {
            if(lastAudioToggle && lastAudioToggle.classList.contains('tgico-largepause')) {
              lastAudioToggle.click();
            }
            
            audio.currentTime = 0;
            audio.play();
            
            lastAudioToggle = toggle;
            
            toggle.classList.remove('tgico-largeplay');
            toggle.classList.add('tgico-largepause');
            
            (Array.from(svg.children) as HTMLElement[]).forEach(node => node.classList.remove('active'));
            
            interval = setInterval(() => {
              if(lastIndex > svg.childElementCount || isNaN(audio.duration)) {
                clearInterval(interval);
                return;
              }
              
              // @ts-ignore
              timeDiv.innerText = String(audio.currentTime | 0).toHHMMSS(true);
              
              lastIndex = Math.round(audio.currentTime / audio.duration * 47);
              
              //svg.children[lastIndex].setAttributeNS(null, 'fill', '#000');
              //svg.children[lastIndex].classList.add('active'); #Иногда пропускает полоски..
              (Array.from(svg.children) as HTMLElement[]).slice(0,lastIndex+1).forEach(node => node.classList.add('active'));
              //++lastIndex;
              //console.log('lastIndex:', lastIndex, audio.currentTime);
              //}, duration * 1000 / svg.childElementCount | 0/* 63 * duration / 10 */);
            }, 20);
          } else {
            audio.pause();
            toggle.classList.add('tgico-largeplay');
            toggle.classList.remove('tgico-largepause');
            
            clearInterval(interval);
          }
        });
        
        audio.addEventListener('ended', () => {
          toggle.classList.add('tgico-largeplay');
          toggle.classList.remove('tgico-largepause');
          clearInterval(interval);
          (Array.from(svg.children) as HTMLElement[]).forEach(node => node.classList.remove('active'));
          
          // @ts-ignore
          timeDiv.innerText = String(audio.currentTime | 0).toHHMMSS(true);
        });
        
        let mousedown = false, mousemove = false;
        progress.addEventListener('mouseleave', (e) => {
          if(mousedown) {
            audio.play();
            mousedown = false;
          }
          mousemove = false;
        })
        progress.addEventListener('mousemove', (e) => {
          mousemove = true;
          if(mousedown) scrub(e, audio, progress);
        });
        progress.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if(!audio.paused) {
            audio.pause();
            scrub(e, audio, progress);
            mousedown = true;
          }
        });
        progress.addEventListener('mouseup', (e) => {
          if (mousemove && mousedown) {
            audio.play();
            mousedown = false;
          }
        });
        progress.addEventListener('click', (e) => {
          if(!audio.paused) scrub(e, audio, progress);
        });
        
        function scrub(e: MouseEvent, audio: HTMLAudioElement, progress: HTMLDivElement) {
          let scrubTime = e.offsetX / 190 /* width */ * audio.duration;
          (Array.from(svg.children) as HTMLElement[]).forEach(node => node.classList.remove('active'));
          lastIndex = Math.round(scrubTime / audio.duration * 47);
          
          (Array.from(svg.children) as HTMLElement[]).slice(0,lastIndex+1).forEach(node => node.classList.add('active'));
          audio.currentTime = scrubTime;
        }
        
        audio.append(source);
        audio.style.display = 'none';
        div.append(audio);
      });
      
      downloadDiv.classList.add('downloading');
    } else {
      downloadDiv.classList.remove('downloading');
      promise = null;
    }
  };
  
  div.addEventListener('click', onClick);
  
  div.click();
  
  return div;
}

function wrapMediaWithTail(photo: any, message: {mid: number, message: string}, container: HTMLDivElement, boxWidth: number, boxHeight: number, isOut: boolean) {
  let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add('bubble__media-container', isOut ? 'is-out' : 'is-in');
  
  let size = appPhotosManager.setAttachmentSize(photo.type ? photo : photo.id, svg, boxWidth, boxHeight);
  let image = svg.firstElementChild as SVGImageElement || document.createElementNS("http://www.w3.org/2000/svg", "image");
  
  let width = +svg.getAttributeNS(null, 'width');
  let height = +svg.getAttributeNS(null, 'height');
  
  //container.style.width = (width - 9) + 'px'; // maybe return
  
  let clipID = 'clip' + message.mid;
  svg.dataset.clipID = clipID;
  //image.setAttributeNS(null, 'clip-path', `url(#${clipID})`);
  if(!svg.contains(image)) {
    image.setAttributeNS(null, 'width', '' + width);
    image.setAttributeNS(null, 'height', '' + height);
    svg.append(image);
  }
  
  let defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
  let clipPathHTML: string = '';/*  = `
  <use href="#message-tail" transform="translate(${width - 2}, ${height}) scale(-1, -1)"></use>
  <rect width="${width - 9}" height="${height}" rx="12"></rect>
  `; */
  
  //window.getComputedStyle(container).getPropertyValue('border-radius');
  
  if(message.message) {
    //clipPathHTML += `<rect width="${width}" height="${height}"></rect>`;
  } else {
    /* if(isOut) {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(${width - 2}, ${height}) scale(-1, -1)"></use>
      <path d="${generatePathData(0, 0, width - 9, height, 6, 0, 12, 12)}" />
      `;
    } else {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(0, ${height}) scale(1, -1)"></use>
      <path d="${generatePathData(0, 0, width - 9, height, 12, 12, 0, 6)}" />
      `;
    } */
    if(isOut) {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(${width - 2}, ${height}) scale(-1, -1)"></use>
      <path />
      `;
    } else {
      clipPathHTML += `
      <use href="#message-tail" transform="translate(2, ${height}) scale(1, -1)"></use>
      <path />
      `;
    }
  }
  
  /* if(isOut) { // top-right, bottom-right
    clipPathHTML += `
    <rect class="br-tr" width="12" height="12" x="${width - 9 - 12}" y="0"></rect>
    <rect class="br-br" width="12" height="12" x="${width - 9 - 12}" y="${height - 12}"></rect>
    `
  } else { // top-left, bottom-left
    clipPathHTML += `
    <rect class="br-tl" width="12" height="12" x="0" y="0"></rect>
    <rect class="br-bl" width="12" height="12" x="0" y="${height - 12}"></rect>
    `;
  } */
  defs.innerHTML = `<clipPath id="${clipID}">${clipPathHTML}</clipPath>`;
  
  svg.prepend(defs);
  container.appendChild(svg);

  return image;
}

export function wrapPhoto(this: AppImManager, photo: any, message: any, container: HTMLDivElement, boxWidth = 380, boxHeight = 380, withTail = true, isOut = false) {
  let peerID = this.peerID;
  
  let size: MTPhotoSize;
  let image: SVGImageElement | HTMLImageElement;
  if(withTail) {
    image = wrapMediaWithTail(photo, message, container, boxWidth, boxHeight, isOut);
  } else {
    size = appPhotosManager.setAttachmentSize(photo.id, container, boxWidth, boxHeight);
    
    image = container.firstElementChild as HTMLImageElement || new Image();
    
    if(!container.contains(image)) {
      container.appendChild(image);
    }
  }
  
  let preloader = new ProgressivePreloader(container, false);
  let load = () => {
    let promise = appPhotosManager.preloadPhoto(photo.id, size);
    
    preloader.attach(container, true, promise);
    
    return promise.then((blob) => {
      if(this.peerID != peerID) {
        this.log.warn('peer changed');
        return;
      }
      
      if(withTail) {
        image.setAttributeNS(null, 'href', URL.createObjectURL(blob));
      } else if(image instanceof Image) {
        image.src = URL.createObjectURL(blob);
      }
    });
  };
  
  /////////console.log('wrapPhoto', load, container, image);
  
  return this.loadMediaQueue ? this.loadMediaQueuePush(load) : load();
}

export function wrapSticker(doc: MTDocument, div: HTMLDivElement, middleware?: () => boolean, lazyLoadQueue?: LazyLoadQueue, group?: string, canvas?: boolean, play = false, onlyThumb = false) {
  let stickerType = doc.mime_type == "application/x-tgsticker" ? 2 : (doc.mime_type == "image/webp" ? 1 : 0);
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc, div);
  }
  
  //////console.log('wrap sticker', doc, onlyThumb);
  
  if(doc.thumbs && !div.firstElementChild) {
    let thumb = doc.thumbs[0];
    
    ///////console.log('wrap sticker', thumb);
    
    if(thumb.bytes) {
      apiFileManager.saveSmallFile(thumb.location, thumb.bytes);
      
      appPhotosManager.setAttachmentPreview(thumb.bytes, div, true);
      
      if(onlyThumb) return Promise.resolve();
    }
  }
  
  if(onlyThumb && doc.thumbs) {
    let thumb = doc.thumbs[0];
    
    let load = () => apiFileManager.downloadSmallFile({
      _: 'inputDocumentFileLocation',
      access_hash: doc.access_hash,
      file_reference: doc.file_reference,
      thumb_size: thumb.type,
      id: doc.id
    }, {dcID: doc.dc_id}).then(blob => {
      let img = new Image();
      
      appWebpManager.polyfillImage(img, blob);
      
      div.append(img);
      
      div.setAttribute('file-id', doc.id);
      appStickersManager.saveSticker(doc);
    });
    
    return lazyLoadQueue ? (lazyLoadQueue.push({div, load}), Promise.resolve()) : load();
  }
  
  let load = () => apiFileManager.downloadSmallFile({
    _: 'inputDocumentFileLocation',
    access_hash: doc.access_hash,
    file_reference: doc.file_reference,
    thumb_size: ''/* document.thumbs[0].type */,
    id: doc.id,
    stickerType: stickerType
  }, {mimeType: doc.mime_type, dcID: doc.dc_id}).then(blob => {
    //console.log('loaded sticker:', blob, div);
    if(middleware && !middleware()) return;
    
    if(div.firstElementChild) {
      div.firstElementChild.remove();
    }
    
    if(stickerType == 2) {
      const reader = new FileReader();
      
      reader.addEventListener('loadend', async(e) => {
        // @ts-ignore
        const text = e.srcElement.result;
        let json = await CryptoWorker.gzipUncompress<string>(text, true);
        
        let animation = await LottieLoader.loadAnimation({
          container: div,
          loop: false,
          autoplay: false,
          animationData: JSON.parse(json),
          renderer: canvas ? 'canvas' : 'svg'
        }, group);
        
        if(!canvas) {
          div.addEventListener('mouseover', (e) => {
            let animation = LottieLoader.getAnimation(div, group);
            
            if(animation) {
              //console.log('sticker hover', animation, div);
              
              // @ts-ignore
              animation.loop = true;
              
              // @ts-ignore
              if(animation.currentFrame == animation.totalFrames - 1) {
                animation.goToAndPlay(0, true);
              } else {
                animation.play();
              }
              
              div.addEventListener('mouseout', () => {
                // @ts-ignore
                animation.loop = false;
              }, {once: true});
            }
          });
        } /* else {
          let canvas = div.firstElementChild as HTMLCanvasElement;
          if(!canvas.width && !canvas.height) {
            console.log('Need lottie resize');
            
            // @ts-ignore
            animation.resize();
          }
        } */
        
        if(play) {
          animation.play();
        }
      });
      
      reader.readAsArrayBuffer(blob);
    } else if(stickerType == 1) {
      let img = new Image();
      
      appWebpManager.polyfillImage(img, blob);
      
      //img.src = URL.createObjectURL(blob);
      
      /* div.style.height = doc.h + 'px';
      div.style.width = doc.w + 'px'; */
      div.append(img);
    }
    
    div.setAttribute('file-id', doc.id);
    appStickersManager.saveSticker(doc);
  });
  
  return lazyLoadQueue ? (lazyLoadQueue.push({div, load}), Promise.resolve()) : load();
}

export function wrapReply(title: string, subtitle: string, media?: any) {
  let div = document.createElement('div');
  div.classList.add('reply');
  
  let replyBorder = document.createElement('div');
  replyBorder.classList.add('reply-border');
  
  let replyContent = document.createElement('div');
  replyContent.classList.add('reply-content');
  
  let replyTitle = document.createElement('div');
  replyTitle.classList.add('reply-title');
  
  let replySubtitle = document.createElement('div');
  replySubtitle.classList.add('reply-subtitle');
  
  replyTitle.innerHTML = title ? RichTextProcessor.wrapEmojiText(title) : '';
  
  if(media) {
    if(media.photo) {
      replySubtitle.innerHTML = 'Photo';
    } else if(media.document && media.document.type) {
      replySubtitle.innerHTML = media.document.type;
    } else if(media.webpage) {
      replySubtitle.innerHTML = RichTextProcessor.wrapPlainText(media.webpage.url);
    } else {
      replySubtitle.innerHTML = media._;
    }
    
    if(media.photo || (media.document && ['video'].indexOf(media.document.type) !== -1)) {
      let replyMedia = document.createElement('div');
      replyMedia.classList.add('reply-media');
      
      let photo = media.photo || media.document;
      
      let sizes = photo.sizes || photo.thumbs;
      if(sizes && sizes[0].bytes) {
        appPhotosManager.setAttachmentPreview(sizes[0].bytes, replyMedia, false, true);
      }
      
      appPhotosManager.preloadPhoto(photo, appPhotosManager.choosePhotoSize(photo, 32, 32))
      .then((blob) => {
        replyMedia.style.backgroundImage = 'url(' + URL.createObjectURL(blob) + ')';
      });
      
      replyContent.append(replyMedia);
      div.classList.add('is-reply-media');
    }
  } else {
    replySubtitle.innerHTML = subtitle ? RichTextProcessor.wrapEmojiText(subtitle) : '';
  }
  
  replyContent.append(replyTitle, replySubtitle);
  div.append(replyBorder, replyContent);
  
  /////////console.log('wrapReply', title, subtitle, media);
  
  return div;
}