/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/* eslint-disable no-use-before-define */

'use strict';

import {
  MANIFEST,
  getState,
  getGitHubSettings,
  isValidShareURL,
  getShareSettings,
  i18n,
  addConfig,
  deleteConfig,
  assembleConfig,
  setConfig,
  getConfig,
  clearConfig,
} from './utils.js';

function getInnerHost(owner, repo, ref) {
  return `${ref}--${repo}--${owner}.hlx.page`;
}

function isValidGitHubURL(giturl) {
  return giturl.startsWith('https://github.com')
    && Object.keys(getGitHubSettings(giturl)).length === 3;
}

function drawLink(url) {
  if (typeof url !== 'string') return '';
  let href = url;
  let text = url;
  if (!url.startsWith('https://')) href = `https://${url}`;
  if (url.includes('sharepoint')) text = 'SharePoint';
  if (url.includes('drive.google.com')) text = 'Google Drive';
  return `<a href="${href}/" title="${href}" target="_blank">${text}</a>`;
}

function drawConfigs() {
  getState(({ configs = [] }) => {
    const container = document.getElementById('configs');
    container.innerHTML = '';
    configs.forEach(({
      owner, repo, ref, mountpoints, project, host,
    }, i) => {
      const innerHost = getInnerHost(owner, repo, ref);
      const section = document.createElement('section');
      section.id = `config-${i}`;
      section.className = 'config';
      section.innerHTML = `
  <div>
    <h4>${project || 'Helix Project'}</h4>
    <p><span class="property">${i18n('config_project_innerhost')}</span>${drawLink(innerHost)}</p>
    ${mountpoints.length
    ? `<p><span class="property">${i18n('config_project_mountpoints')}</span>${mountpoints.map((mp) => drawLink(mp)).join(' ')}</p>`
    : ''}
    ${host
    ? `<p><span class="property">${i18n('config_project_host')}</span>${drawLink(host)}</p>`
    : ''}
    </div>
  <div>
    <button class="shareConfig" title="${i18n('config_share')}">${i18n('config_share')}</button>
    <button class="editConfig" title="${i18n('config_edit')}">${i18n('config_edit')}</button>
    <button class="deleteConfig" title="${i18n('config_delete')}">${i18n('config_delete')}</button>
  </div>`;
      container.appendChild(section);
    });
    // wire share buttons
    document.querySelectorAll('button.shareConfig').forEach((button, i) => {
      button.addEventListener('click', (evt) => shareConfig(i, evt));
    });
    // wire edit buttons
    document.querySelectorAll('button.editConfig').forEach((button, i) => {
      button.addEventListener('click', () => editConfig(i));
    });
    // wire delete buttons
    document.querySelectorAll('button.deleteConfig').forEach((button, i) => {
      button.addEventListener('click', () => deleteConfig(i, drawConfigs));
    });
  });
}

function shareConfig(i, evt) {
  getState(({ configs = [] }) => {
    const config = configs[i];
    const shareUrl = new URL('https://www.hlx.live/tools/sidekick/');
    shareUrl.search = new URLSearchParams([
      ['project', config.project || ''],
      ['giturl', `https://github.com/${config.owner}/${config.repo}${config.ref ? `/tree/${config.ref}` : ''}`],
    ]).toString();
    if (navigator.share) {
      navigator.share({
        title: i18n('config_shareurl_share_title', [config.project || config.innerHost]),
        url: shareUrl.toString(),
      });
    } else {
      navigator.clipboard.writeText(shareUrl.toString());
      evt.target.classList.add('success');
      evt.target.title = i18n('config_shareurl_copied', [config.project || config.innerHost]);
      // notify(i18n('config_shareurl_copied'));
      window.setTimeout(() => {
        evt.target.classList.remove('success');
        evt.target.title = 'Share';
      }, 3000);
    }
  });
}

function editConfig(i) {
  getState(({ configs = [] }) => {
    const config = configs[i];
    const editorFragment = document.getElementById('configEditorTemplate').content.cloneNode(true);
    const editor = editorFragment.querySelector('#configEditor');
    const close = () => {
      // unregister esc handler
      window.removeEventListener('keyup', keyHandler);
      // redraw configs
      drawConfigs();
    };
    const keyHandler = (evt) => {
      if (evt.key === 'Escape') {
        close();
      }
      if (evt.key === 'Enter') {
        window.removeEventListener('keyup', keyHandler);
        save();
      }
    };
    const save = async () => {
      const input = {
        giturl: document.querySelector('#edit-giturl').value,
        mountpoints: [
          document.querySelector('#edit-mountpoints').value,
        ],
        project: document.querySelector('#edit-project').value,
        host: document.querySelector('#edit-host').value,
        devMode: document.querySelector('#edit-devMode').checked,
      };
      configs[i] = {
        ...config,
        ...await assembleConfig(input),
      };
      // unregister esc handler
      window.removeEventListener('keyup', keyHandler);
      // save configs
      setConfig('sync', { hlxSidekickConfigs: configs }, () => {
        drawConfigs();
        close();
      });
    };
    const buttons = editor.querySelectorAll('button');
    buttons[0].textContent = i18n('save');
    buttons[0].title = i18n('save');
    buttons[0].addEventListener('click', save);
    // wire cancel button
    buttons[1].textContent = i18n('cancel');
    buttons[1].title = i18n('cancel');
    buttons[1].addEventListener('click', close);
    // insert editor in place of config section
    document.getElementById(`config-${i}`).replaceWith(editorFragment);
    // pre-fill form
    document.querySelectorAll('#configEditor input').forEach((field) => {
      const key = field.id.split('-')[1];
      const value = config[key];
      if (typeof value === 'object') {
        field.value = value[0] || '';
      } else if (typeof value === 'boolean' && value) {
        field.setAttribute('checked', value);
      } else {
        field.value = config[key] || '';
      }
      field.setAttribute('placeholder', i18n(`config_manual_${key}_placeholder`));
      const label = document.querySelector(`#configEditor label[for="${field.id}"]`);
      if (label) {
        label.textContent = i18n(`config_manual_${key}`);
      }
    });
    // focus first field
    const firstField = editor.querySelector('input, textarea');
    firstField.focus();
    firstField.select();
    // register esc handler
    window.addEventListener('keyup', keyHandler);
    // register return handler

    // disable other config buttons while editor is shown
    document
      .querySelectorAll('section.config:not(#configEditor) button')
      .forEach((btn) => {
        btn.disabled = true;
      });
  });
}

function clearForms() {
  document.querySelectorAll('input, textarea').forEach((field) => {
    field.value = '';
  });
}

async function updateHelpTopic(helpContent, topicId, userStatus) {
  let updated = false;
  const newHelpContent = helpContent.map((topic) => {
    if (topic.id === topicId) {
      topic.userStatus = userStatus;
      updated = true;
    }
    return topic;
  });
  if (updated) {
    await setConfig('sync', {
      hlxSidekickHelpContent: newHelpContent,
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // i18n
  document.body.innerHTML = document.body.innerHTML
    .replaceAll(/__MSG_([0-9a-zA-Z_]+)__/g, (match, msg) => i18n(msg));
  drawConfigs();

  document.getElementById('resetButton').addEventListener('click', () => {
    // eslint-disable-next-line no-alert
    if (window.confirm(i18n('config_delete_all_confirm'))) {
      clearConfig('sync', () => {
        clearConfig('local', () => {
          drawConfigs();
        });
      });
    }
  });

  document.getElementById('addShareConfigButton').addEventListener('click', async () => {
    const shareurl = document.getElementById('shareurl').value;
    // check share url
    if (isValidShareURL(shareurl)) {
      await addConfig(getShareSettings(shareurl), (added) => {
        if (added) {
          drawConfigs();
          clearForms();
        }
      });
    } else {
      // eslint-disable-next-line no-alert
      window.alert(i18n('config_invalid_shareurl'));
    }
  });

  document.getElementById('addManualConfigButton').addEventListener('click', async () => {
    const giturl = document.getElementById('giturl').value;
    if (isValidGitHubURL(giturl)) {
      await addConfig({
        giturl,
        project: document.getElementById('project').value,
      }, (added) => {
        if (added) {
          drawConfigs();
          clearForms();
        }
      });
    } else {
      // eslint-disable-next-line no-alert
      window.alert(i18n('config_invalid_giturl'));
    }
  });

  // config import
  document.getElementById('importFile').addEventListener('change', ({ target }) => {
    const { files } = target;
    if (files.length > 0) {
      // eslint-disable-next-line no-alert
      if (window.confirm(i18n('config_import_confirm'))) {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          const { configs: importedConfigs } = JSON.parse(reader.result);
          setConfig('sync', {
            hlxSidekickConfigs: importedConfigs,
          }, () => {
            // eslint-disable-next-line no-alert
            window.alert(i18n('config_import_success'));
            drawConfigs();
          });
        });
        try {
          reader.readAsText(files[0]);
        } catch (e) {
          // eslint-disable-next-line no-alert
          window.alert(i18n('config_import_failure'));
        }
      }
    } else {
      // eslint-disable-next-line no-alert
      window.alert(i18n('config_invalid_import'));
    }
    // reset file input
    target.value = '';
  });

  // config export
  document.getElementById('exportButton').addEventListener('click', () => {
    getState(({ configs }) => {
      if (configs.length > 0) {
        // prepare export data
        const info = {
          name: MANIFEST.name,
          version: MANIFEST.version,
          date: new Date().toUTCString(),
        };
        const data = JSON.stringify({ info, configs }, null, '  ');
        // create file link on the fly
        const exportLink = document.createElement('a');
        exportLink.download = `helix-sidekick-backup-${Date.now()}.json`;
        exportLink.href = `data:application/json;charset=utf-8,${encodeURIComponent(data)}`;
        // exportLink.classList.add('hidden');
        document.body.append(exportLink);
        exportLink.click();
        exportLink.remove();
      } else {
        // eslint-disable-next-line no-alert
        window.alert(i18n('config_invalid_export'));
      }
    });
  });

  // nav toggle
  document.getElementById('navToggle').addEventListener('click', () => {
    document.querySelector('nav ul').classList.toggle('appear');
  });
  document.querySelectorAll('nav ul li a').forEach((a) => {
    a.addEventListener('click', () => {
      document.querySelector('nav ul').classList.remove('appear');
    });
  });

  // push down toggle
  (async () => {
    const input = document.getElementById('pushDownSwitch');
    input.checked = await getConfig('sync', 'hlxSidekickPushDown');
    input.addEventListener('click', () => setConfig('sync', {
      hlxSidekickPushDown: input.checked,
    }));
  })();

  // list help topics and user status
  (async () => {
    const helpContainer = document.getElementById('helpTopics');
    const helpContent = await getConfig('sync', 'hlxSidekickHelpContent') || [];
    const list = helpContainer.appendChild(document.createElement('ul'));
    list.className = 'quiet';
    helpContent.forEach((topic) => {
      const topicContainer = list.appendChild(document.createElement('li'));
      const { id, title, userStatus } = topic;
      const checkbox = topicContainer.appendChild(document.createElement('input'));
      checkbox.id = `help-topic-${id}`;
      checkbox.type = 'checkbox';
      checkbox.checked = userStatus === 'acknowledged';
      checkbox.addEventListener('click', () => {
        const newUserStatus = checkbox.checked ? 'acknowledged' : '';
        updateHelpTopic(helpContent, id, newUserStatus);
      });
      const label = topicContainer.appendChild(document.createElement('label'));
      label.setAttribute('for', checkbox.id);
      label.textContent = title;
    });
    if (helpContent.length > 1) {
      // enable check-all/uncheck-all buttons
      const checkAllButton = document.getElementById('helpTopicsCheckAll');
      checkAllButton.removeAttribute('disabled');
      checkAllButton.addEventListener(
        'click',
        () => {
          helpContent.forEach(async (topic) => {
            updateHelpTopic(helpContent, topic.id, 'acknowledged');
          });
          helpContainer.querySelectorAll(':scope input[type="checkbox"]').forEach((cb) => {
            cb.checked = true;
          });
        },
      );
      const uncheckAllButton = document.getElementById('helpTopicsUncheckAll');
      uncheckAllButton.removeAttribute('disabled');
      uncheckAllButton.addEventListener(
        'click',
        () => {
          helpContent.forEach(async (topic) => {
            updateHelpTopic(helpContent, topic.id, '');
          });
          helpContainer.querySelectorAll(':scope input[type="checkbox"]').forEach((cb) => {
            cb.checked = false;
          });
        },
      );
    }
  })();

  // add advanced mode link to nav
  const isAdvancedMode = window.location.search === '?advanced';
  const advancedModeLink = document.createElement('a');
  advancedModeLink.textContent = i18n(isAdvancedMode ? 'standard' : 'advanced');
  advancedModeLink.title = i18n(isAdvancedMode ? 'standard' : 'advanced');
  advancedModeLink.setAttribute('aria-role', 'link');
  advancedModeLink.setAttribute('tabindex', 0);
  advancedModeLink.addEventListener('click', ({ target }) => {
    window.location.href = `${window.location.pathname}${isAdvancedMode ? '' : '?advanced'}`;
    target.parentElement.classList.toggle('selected');
  });
  const advancedModeListItem = document.createElement('li');
  advancedModeListItem.className = isAdvancedMode ? 'selected' : '';
  advancedModeListItem.append(advancedModeLink);
  document.querySelector('nav > ul').append(advancedModeListItem);
  if (isAdvancedMode) {
    document.body.classList.add('advanced');
  }

  // area toggles
  document.querySelectorAll('.area > h2').forEach(async ($title) => {
    const configId = `hlxSidekickOption-${$title.parentElement.id}`;
    const state = await getConfig('local', configId);
    if (state === 'expanded') {
      $title.parentElement.classList.add('expanded');
    } else if (state === 'collapsed') {
      $title.parentElement.classList.remove('expanded');
    }
    $title.addEventListener('click', ({ target }) => {
      const $parent = target.parentElement;
      $parent.classList.toggle('expanded');
      const config = {};
      config[configId] = $parent.classList.contains('expanded') ? 'expanded' : 'collapsed';
      setConfig('local', config, () => {
        $parent.scrollIntoView();
      });
    });
  });

  // enable developer options
  getState(({ devMode, branchName, adminVersion = null }) => {
    const devModeSwitch = document.getElementById('devModeSwitch');
    const branchNameField = document.getElementById('branchName');
    const branchNameSave = document.getElementById('branchNameSave');
    const branchNameReset = document.getElementById('branchNameReset');
    const adminVersionField = document.getElementById('adminVersion');
    const adminVersionSave = document.getElementById('adminVersionSave');
    const adminVersionReset = document.getElementById('adminVersionReset');

    devModeSwitch.checked = devMode;
    devModeSwitch.addEventListener('click', () => setConfig('local', {
      hlxSidekickDevMode: devModeSwitch.checked,
      hlxSidekickBranchName: null,
    }, () => {
      branchNameField.value = '';
    }));

    branchNameField.value = branchName || '';
    branchNameSave.addEventListener('click', () => {
      setConfig('local', {
        hlxSidekickBranchName: branchNameField.value,
        hlxSidekickDevMode: false,
      }, () => {
        devModeSwitch.checked = false;
      });
    });
    branchNameReset.addEventListener('click', () => {
      branchNameField.value = '';
      setConfig('local', {
        hlxSidekickBranchName: null,
      });
    });

    adminVersionField.value = adminVersion || '';
    adminVersionSave.addEventListener('click', () => setConfig('local', {
      hlxSidekickAdminVersion: adminVersionField.value,
    }));
    adminVersionReset.addEventListener('click', () => {
      adminVersionField.value = '';
      setConfig('local', {
        hlxSidekickAdminVersion: null,
      });
    });
  });
});
