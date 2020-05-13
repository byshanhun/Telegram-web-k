import appProfileManager from "../lib/appManagers/appProfileManager";
import { $rootScope } from "../lib/utils";

$rootScope.$on('avatar_update', (e: CustomEvent) => {
  let peerID = e.detail;

  appProfileManager.removeFromAvatarsCache(peerID);
  (Array.from(document.querySelectorAll('avatar-element[peer="' + peerID + '"]')) as AvatarElement[]).forEach(elem => {
    console.log('updating avatar:', elem);
    elem.update();
  });
}); 

export default class AvatarElement extends HTMLElement {
  private peerID: number;
  private isDialog = false;

  constructor() {
    super();
    // элемент создан
  }

  connectedCallback() {
    // браузер вызывает этот метод при добавлении элемента в документ
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)

    this.isDialog = !!this.getAttribute('dialog');
  }

  disconnectedCallback() {
    // браузер вызывает этот метод при удалении элемента из документа
    // (может вызываться много раз, если элемент многократно добавляется/удаляется)
  }

  static get observedAttributes(): string[] {
    return ['peer', 'dialog'/* массив имён атрибутов для отслеживания их изменений */];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    // вызывается при изменении одного из перечисленных выше атрибутов
    if(name == 'peer') {
      this.peerID = +newValue;
    } else if(name == 'dialog') {
      this.isDialog = !!newValue;
    }

    this.update();
  }

  public update() {
    appProfileManager.putPhoto(this, this.peerID, this.isDialog);
  }

  adoptedCallback() {
    // вызывается, когда элемент перемещается в новый документ
    // (происходит в document.adoptNode, используется очень редко)
  }

  // у элемента могут быть ещё другие методы и свойства
}

customElements.define("avatar-element", AvatarElement);