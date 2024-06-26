import { Component, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '@/app/core/api.service';
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';
import { SettingsService } from '@/app/core/settings.service';

/* eslint-disable no-underscore-dangle */

@Component({
  selector: 'app-bridge-plugins-modal',
  templateUrl: './bridge-plugins-modal.component.html',
  styleUrls: ['./bridge-plugins-modal.component.scss'],
})
export class BridgePluginsModalComponent implements OnInit {
  @Input() plugin: any;
  @Input() schema: any;

  public canConfigure = true;
  public configBlocks: any[] = [];
  public enabledBlocks: Record<number, boolean> = {};
  public usernameCache: Map<number, string> = new Map();
  public deviceInfo: Map<string, any> = new Map();

  public saveInProgress = false;
  public restartInProgress: Record<string, boolean> = {};

  constructor(
    public activeModal: NgbActiveModal,
    public $settings: SettingsService,
    private $api: ApiService,
    private $modal: NgbModal,
    private $plugins: ManagePluginsService,
    private $router: Router,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadPluginConfig();
  }

  loadPluginConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (configBlocks) => {
        this.configBlocks = configBlocks;
        for (const [i, block] of this.configBlocks.entries()) {
          if (block._bridge && block._bridge.username) {
            this.enabledBlocks[i] = true;
            this.usernameCache.set(i, block._bridge.username);
            this.getDeviceInfo(block._bridge.username);
          }
        }
      },
      () => {
        this.canConfigure = false;
      },
    );
  }

  async toggleExternalBridge(block: any, enable: boolean, index: number) {
    if (!enable) {
      delete block._bridge;
      return;
    }

    block._bridge = {
      username: this.usernameCache.get(index) || this.generateUsername(),
      port: await this.getUnusedPort(),
    };

    this.usernameCache.set(index, block._bridge.username);
    await this.getDeviceInfo(block._bridge.username);
  }

  async getUnusedPort() {
    this.saveInProgress = true;
    try {
      const lookup = await this.$api.get('/server/port/new').toPromise();
      return lookup.port;
    } catch (e) {
      return Math.floor(Math.random() * (60000 - 30000 + 1) + 30000);
    } finally {
      this.saveInProgress = false;
    }
  }

  async getDeviceInfo(username: string) {
    try {
      this.deviceInfo[username] = await this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`).toPromise();
    } catch (e) {
      this.deviceInfo[username] = false;
    }
  }

  async save() {
    this.saveInProgress = true;

    try {
      await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.configBlocks).toPromise();
      this.activeModal.close();
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      });
    } catch (err) {
      this.$toastr.error(
        this.$translate.instant('config.toast_failed_to_save_config') + ': ' + err.error?.message,
        this.$translate.instant('toast.title_error'),
      );
    } finally {
      this.saveInProgress = false;
    }
  }

  openPluginConfig() {
    // Close the existing modal
    this.activeModal.close();

    // Open the plugin config modal
    this.$plugins.settings({
      name: this.plugin.name,
      settingsSchema: true,
      links: {},
    });
  }

  async restartChildBridge(username: string) {
    this.restartInProgress[username] = true;
    try {
      await this.$api.put(`/server/restart/${username.replace(/:/g, '')}`, {}).toPromise();
      this.$toastr.success(
        this.$translate.instant('child_bridge.toast_restart_requested'),
        this.$translate.instant('toast.title_success'),
      );
    } catch (err) {
      this.$toastr.error(
        'Failed to restart bridge: ' + err.error?.message,
        this.$translate.instant('toast.title_error'),
      );
      this.restartInProgress[username] = false;
    } finally {
      setTimeout(() => {
        this.restartInProgress[username] = false;
      }, 12000);
    }
  }

  /**
   * Generates a new random username
   */
  public generateUsername() {
    const hexDigits = '0123456789ABCDEF';
    let username = '0E:';
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      if (i !== 4) {
        username += ':';
      }
    }
    return username;
  }

  openFullConfigEditor() {
    this.$router.navigate(['/config']);
    this.activeModal.close();
  }
}
