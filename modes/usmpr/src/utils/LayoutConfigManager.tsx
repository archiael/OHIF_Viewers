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
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;

    // Create container if it doesn't exist
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'usmpr-layout-config-modal';
      document.body.appendChild(this.container);
      this.root = createRoot(this.container);
    }

    // Render the modal
    this.render();
  }

  /**
   * Hide the layout configuration modal
   */
  hide(): void {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.render();
  }

  /**
   * Render the modal
   */
  private render(): void {
    if (!this.root) {
      return;
    }

    this.root.render(
      <LayoutConfigModal
        isOpen={this.isOpen}
        onClose={() => this.hide()}
        servicesManager={this.servicesManager}
      />
    );
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
