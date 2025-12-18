import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import LayoutConfigModal from '../components/LayoutConfigModal';

/**
 * Manager class for the layout configuration modal
 */
export class LayoutConfigManager {
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private servicesManager: any = null;

  /**
   * Set the services manager
   */
  setServicesManager(servicesManager: any): void {
    this.servicesManager = servicesManager;
  }

  /**
   * Show the layout configuration modal
   */
  show(): void {
    console.log('📂 LayoutConfigManager.show() called');
    console.log('📍 Current isOpen state:', this.isOpen);

    if (this.isOpen) {
      console.log('⚠️ Modal already open, returning');
      return;
    }

    this.isOpen = true;
    console.log('✅ Set isOpen to true');

    // Create container if it doesn't exist
    if (!this.container) {
      console.log('🆕 Creating new container');
      this.container = document.createElement('div');
      this.container.id = 'usmpr-layout-config-modal';
      document.body.appendChild(this.container);
      this.root = createRoot(this.container);
      console.log('✅ Container created and appended to body');
    }

    // Render the modal
    console.log('🎨 Calling render()...');
    this.render();
  }

  /**
   * Hide the layout configuration modal
   */
  hide(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.render();
  }

  /**
   * Render the modal
   */
  private render(): void {
    console.log('🎨 render() called, isOpen:', this.isOpen);
    console.log('🔍 root exists?', !!this.root);

    if (!this.root) {
      console.error('❌ No root found, cannot render!');
      return;
    }

    console.log('✅ Rendering LayoutConfigModal with isOpen:', this.isOpen);
    this.root.render(
      <LayoutConfigModal
        isOpen={this.isOpen}
        onClose={() => this.hide()}
        servicesManager={this.servicesManager}
      />
    );
    console.log('✅ Modal rendered');
  }

  /**
   * Clean up and remove the modal
   */
  destroy(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    this.container = null;
    this.isOpen = false;
  }
}

export default LayoutConfigManager;
