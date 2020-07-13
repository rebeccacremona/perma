let Spinner = require('spin.js');

let APIModule = require('./helpers/api.module.js');
var DOMHelpers = require('./helpers/dom.helpers.js');
var ErrorHandler = require('./error-handler.js');
let FolderTreeModule = require('./folder-tree.module.js');
let FolderSelectorHelper = require('./helpers/folder-selector.helper.js');
let Helpers = require('./helpers/general.helpers.js');
let Modals = require('./modals.module.js');
let ProgressBarHelper = require('./helpers/progress-bar.helper.js');
let batchLinksTemplate = require("./hbs/batch-links.handlebars");

let target_folder;
let interval;

// elements in the DOM, retrieved during init()
let $batch_details, $batch_details_wrapper,
    $batch_modal_title, $batch_progress_report, $batch_target_path,
    $create_batch_wrapper, $export_csv, $input, $input_area, $loading, $modal,
    $spinner, $start_button;


// Vue helpers

const humanTimestamp = function(datetime){
  return new Date(datetime).toLocaleString("en-us", {
    year:   "numeric",
    month:  "long",
    day:    "numeric",
    hour:   "numeric",
    minute: "2-digit"
  });
}

const STEPS = 6

const SPINNER = new Spinner({lines: 15, length: 10, width: 2, radius: 9, corners: 0, color: '#222222', trail: 50});

// Vue components

export var CreateBatchLinks = {
  template: `
    <p id="create-batch-links">or <a id="create-batch" ref="createBatch" data-toggle="modal" href="#batch-modal" @click="returnFocus">create multiple links</a></p>
  `,
  methods: {
    returnFocus(){
      Modals.returnFocusTo(this.$refs.createBatch);
    }
  }
}

export var LinkBatchHistory = {
  data(){
    return {
      batches: null,
      moreBatches: false,
    }
  },
  created(){
    this.fetchBatches()
  },
  mounted(){
  // These events handlers aren't getting picked up.... not sure why.
  // Let's check and see if they are working in prod.
  // let self = this;
  // $(self.$refs.batchHistory)
  //   .on('shown.bs.collapse', function(){
  //     self.adjustScrolling();
  //   })
  //   .on('hidden.bs.collapse', function(){
  //     self.adjustScrolling();
  //   });
  },
  methods: {
    fetchBatches(limit=7){
      if (settings.ENABLE_BATCH_LINKS) {
        APIModule.request('GET', '/archives/batches/', {
          'limit': limit
        }).then((data) => {
          if (data.objects.length > 0) {
            this.batches = data.objects;
            this.moreBatches = data.meta.next;
            this.adjustScrolling();
          }
        })
      }
    },
    adjustScrolling(){
      DOMHelpers.scrollIfTallerThanFractionOfViewport(".col-folders", 0.9);
    },
    showAll(e){
      this.fetchBatches(null);
      this.$refs.batchHistory.focus()
    },
    displayBatch(e){
      let target = e.target
      if (target.matches('a[data-batch]')){
        let batch = target.dataset.batch;
        let folderPath= target.dataset.folderpath;
        let org = parseInt(target.dataset.org);
        Helpers.triggerOnWindow('batchLink.reloadTreeForFolder', {
          folderId: folderPath.split('-'),
          orgId: org
        });
        $(window).bind("folderTree.ready.batchToggle", () => {
          $input.hide();
          show_modal_with_batch(batch);
          Modals.returnFocusTo(target);
          $(window).unbind("folderTree.ready.batchToggle");
        });
      }
    }
  },
  filters: {
    humanTimestamp: humanTimestamp
  },
  template: `
    <div id="batch-list-container" :class="{ _hide: !batches }">
      <div id="batch-list-toggle">
        <a role="button" class="dropdown" data-toggle="collapse" href="#batch-history" aria-expanded="false" aria-controls="batch-history">
          <h3>Link Batch History</h3>
        </a>
      </div>
      <div id="batch-history" ref="batchHistory" class="collapse" tabindex="-1">
        <ul class="item-container" @click.prevent="displayBatch">
          <li class="item-subtitle"
              v-for="batch in batches"
              :key="batch.id">
            <a href="#"
               :data-batch="batch.id"
               :data-folderpath="batch.target_folder.path"
               :data-org="batch.target_folder.organization">
               <span class="sr-only">Batch created </span>
               {{ batch.started_on | humanTimestamp }}
            </a>
          </li>
        </ul>
        <a href="#" id="all-batches" v-if="moreBatches" @click.prevent="showAll">all batches</a>
      </div>
    </div>`
}


export var LinkEntry = {
  props: ['captureJob'],
  computed: {
    progress(){
      return (this.captureJob.step_count / STEPS) * 100;
    },
    localUrl(){
      return this.captureJob.guid ? `//${window.host}/${this.captureJob.guid}` : null;
    },
    isError(){
      return ! ['pending', 'in_progress', 'completed'].includes(this.captureJob.status)
    },
    errorMessage(){
      return APIModule.stringFromNestedObject(JSON.parse(this.captureJob.message)) || "Error processing request";
    }
  },
  template: `
    <div :class="['item-container', { _isFailed: isError || captureJob.user_deleted }]">
      <div class="row">
          <div v-if="isError" class="link-desc col col-sm-6 col-md-60">
            <div class="failed_header">{{ errorMessage }}</div>
            <div class="item-title">We’re unable to create your Perma Link.</div>
            <div class="item-date">submitted: {{ captureJob.submitted_url }}</div>
          </div>
          <template v-else>
            <div class="link-desc col col-sm-6 col-md-60">
              <div class="item-title">{{ captureJob.title }}</div>
              <div class="item-subtitle">{{ captureJob.submitted_url }}</div>
            </div>
            <div class="link-progress col col-sm-6 col-md-40 align-right item-permalink">
              <a class="perma no-drag" :href="localUrl" target="_blank">{{localUrl}}</a>
            </div>
          </template>
      </div>
    </div>
  `
}

export var LinkBatchModal = {
  components: {
    'link-entry': LinkEntry,
  },
  data(){
    return {
      urlList: "",
      batchId: null,
      targetFolderId: null,
      captureJobs: null,
      showSpinner: false,
      showExport: false,
    }
  },
  mounted(){
    $(this.$refs.modal)
      .on('hidden.bs.modal', ()=>{
        // reset the modal so it's fresh
        this.batchId = null
        this.urlList = ""
        this.stopSpinner()
        this.showExport = false
      });
  },
  watch: {
    batchId(oldId, newID){
      this.fetchLinks();
    }
  },
  computed: {
    title(){
      return this.captureJobs ? "Link Batch Details" : "Create A Link Batch"
    },
    batchComplete(){
    },
    percentageComplete(){
    },
    exportUrl(){
      return this.batchId ? `/api/v1/archives/batches/${this.batchId}/export` : "#"
    }
  },
  methods: {
    fetchLinks(){
      if (this.batchId) {
        APIModule.request('GET', `/archives/batches/${this.batchId}`)
          .then((data) => {
            this.captureJobs = data.capture_jobs;
            this.targetFolderId = data.target_folder.id;
          });
      }
    },
    startSpinner(){
      if (!this.$refs.spinner.childElementCount) {
        SPINNER.spin(this.$refs.spinner);
      }
      this.showSpinner = true;
    },
    stopSpinner(){
      this.showSpinner = false;
      SPINNER.stop();
    },
  },
  template: `
    <div class="modal" id="batch-modal" ref="modal" tabindex="-1" role="dialog" aria-labelled-by="batch-modal-title">
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">

          <div class="modal-header">
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
            <h3 id="batch-modal-title" class="modal-title">{{ title }}</h3>
          </div>

          <div ref="spinner" :class="[{ _hide: !showSpinner}, 'spinner']">
          <span class="sr-only" id="loading" tabindex="-1">Loading</span></div>

          <div class="modal-body">
            <div v-if="captureJobs" id="batch-details-wrapper" tabindex="-1" :class="{ _hide: !captureJobs}">
              <p id="batch-progress-report" role="log" aria-atomic="false"></p>
              <div id="batch-details" aria-describedby="batch-progress-report">
                <!-- NB: Tabindexes on these elements and their children are overridden via js -->
                <div class="form-group">
                  <p>These Perma Links were added to {{ folder }}</p>
                </div>
                <div class="form-group">
                  <div v-for="captureJob in captureJobs">
                    <link-entry :captureJob="captureJob"></link-entry>
                  </div>
                </div>
              </div>
              <div class="form-buttons">
                <button class="btn cancel" data-dismiss="modal">Exit</button>
                <a :href="exportUrl" id="export-csv" :class="[ {_hide: !showExport}, 'btn' ]">Export list as CSV</a>
              </div>
            </div>
            <div v-else id="batch-create-input">
              <div class="form-group">
                <label id="batch-target" for="batch-target-path" class="label-affil">These Perma Links will be affiliated with</label>
                <select id="batch-target-path" class="form-control"></select>
              </div>
              <div class="form-group">
                <textarea v-model="urlList" aria-label="Paste your URLs here (one URL per line)" placeholder="Paste your URLs here (one URL per line)"></textarea>
              </div>
              <div class="form-buttons">
                <button id="start-batch" class="btn" disabled="disabled">Create Links</button>
                <button class="btn cancel" data-dismiss="modal">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

// Vue app

var app = new Vue({
  el: '#vue-app',
  components: {
    'link-batch-history': LinkBatchHistory,
    'link-batch-modal' : LinkBatchModal,
    'create-batch-links': CreateBatchLinks,
  }
})



// Original JS

function render_batch(links_in_batch, folder_path) {
    const average_capture_time = average; //global var set by template
    const celery_workers = workers; //global var set by template
    const steps = 6;

    let all_completed = true;
    let batch_progress = [];
    let errors = 0;
    links_in_batch.forEach(function(link) {
        // link.progress = (link.step_count / steps) * 100;
        // link.local_url = link.guid ? `${window.host}/${link.guid}` : null;
        switch(link.status){
            case "pending":
                link.isPending = true;
                // divide into batches; each batch takes average_capture_time to complete
                let waitMinutes = Math.round(Math.floor(link.queue_position / celery_workers) * average_capture_time / 60);
                if (waitMinutes >= 1){
                    link.beginsIn = `about ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''}.`;
                } else {
                    link.beginsIn = `less than 1 minute.`;
                }
                all_completed = false;
                batch_progress.push(link.progress);
                break;
            case "in_progress":
                link.isProcessing = true;
                all_completed = false;
                batch_progress.push(link.progress);
                break;
            case "completed":
                link.isComplete = true;
                batch_progress.push(link.progress);
                break;
            default:
                link.isError = true;
                link.error_message = APIModule.stringFromNestedObject(JSON.parse(link.message)) || "Error processing request";
                errors += 1;
        }
    });
    let percent_complete = Math.round(batch_progress.reduce((a, b) => a + b, 0) / (batch_progress.length * 100) * 100)
    let message = `Batch ${percent_complete}% complete.`;
    if (errors > 0){
        message += ` <span>${errors} error${errors > 1 ? 's' : ''}.</span>`;
    }
    $batch_progress_report.html(message);
    let template = batchLinksTemplate({"links": links_in_batch, "folder": folder_path});
    $batch_details.html(template);
    if (all_completed) {
        $export_csv.removeClass("_hide");
    }
    return all_completed;
};

function handle_error(error){
    ErrorHandler.airbrake.notify(error);
    clearInterval(interval);
    APIModule.showError(error);
    $modal.modal("hide");
}

function show_batch(batch_id) {
    // show batch details
    // alter the modal title
    // set exportUrl
    // start the spinner
    let first_time = true;
    let retrieve_and_render = function() {
        APIModule.request(
            'GET', `/archives/batches/${batch_id}`
        ).then(function(batch_data) {
            if (first_time) {
                first_time = false;
                $modal.focus();
                SPINNER.stop();
                $spinner.addClass("_hide");
                $batch_details.attr("aria-hidden", "true");
                // prevents tabbing to elements that are getting swapped out
                $batch_details.find('*').each(function(){$(this).attr('tabIndex', '-1')});
            }
            let folder_path = FolderTreeModule.getPathForId(batch_data.target_folder.id).join(" > ");
            let all_completed = render_batch(batch_data.capture_jobs, folder_path);
            if (all_completed) {
                clearInterval(interval);
                $batch_details.attr("aria-hidden", "false");
                // undo our special focus handling
                $batch_details.find('*').each(function(){$(this).removeAttr('tabIndex')});
            }
        }).catch(function(error){
            handle_error(error);
        });
    }
    retrieve_and_render();
    interval = setInterval(retrieve_and_render, 2000);
}

export function show_modal_with_batch(batch_id) {
    show_batch(batch_id);
    $modal.modal("show");
}

function start_batch() {
    $input.hide();
    SPINNER.spin($spinner[0]);
    $spinner.removeClass("_hide");
    $loading.focus();
    APIModule.request('POST', '/archives/batches/', {
        "target_folder": target_folder,
        "urls": $input_area.val().split("\n").map(s => {return s.trim()}).filter(Boolean),
        "human": true
    }).then(function(data) {
        show_batch(data.id);
        populate_link_batch_list();
        $(window).trigger("BatchLinkModule.batchCreated", data.links_remaining);
    }).catch(function(error){
        handle_error(error);
    });
};

function refresh_target_path_dropdown() {
    FolderSelectorHelper.makeFolderSelector($batch_target_path, target_folder);
    $start_button.prop('disabled', !Boolean(target_folder));
};

function set_folder_from_trigger (evt, data) {
    if (typeof data !== 'object') {
        data = JSON.parse(data);
    }
    target_folder = data.folderId;
    $batch_target_path.find("option").each(function() {
        if ($(this).val() == target_folder) {
            $(this).prop("selected", true);
        }
    });
};

function set_folder_from_dropdown(new_folder_id) {
    target_folder = new_folder_id;
};

function setup_handlers() {
    // listen for folder changes from other UI components
    $(window)
        .on('FolderTreeModule.selectionChange', set_folder_from_trigger)
        .on('dropdown.selectionChange', set_folder_from_trigger)
        .on('createLink.toggleProgress', () => { $create_batch_wrapper.toggle() });

    // update all UI components when folder changed using the modal's dropdown
    $batch_target_path.change(function() {
        let new_folder_id = $(this).val();
        if (new_folder_id) {
            $start_button.prop('disabled', false);
            set_folder_from_dropdown(new_folder_id);
            Helpers.triggerOnWindow("dropdown.selectionChange", {
              folderId: $(this).val(),
              orgId: $(this).data('orgid')
            });
        } else {
            $start_button.prop('disabled', true);
        }
    });

    $modal
      .on('shown.bs.modal', refresh_target_path_dropdown)
      .on('hide.bs.modal', function(){
        clearInterval(interval);
        $(window).trigger("BatchLinkModule.refreshLinkList");
      });

    $start_button.click(start_batch);
 };

export function init() {
    $(function() {
        $batch_details = $('#batch-details');
        $batch_details_wrapper = $('#batch-details-wrapper');
        $batch_modal_title = $("#batch-modal-title");
        $batch_progress_report = $('#batch-progress-report');
        $batch_target_path = $('#batch-target-path');
        $create_batch_wrapper = $('#create-batch-links');
        $export_csv = $('#export-csv');
        $input = $('#batch-create-input');
        $input_area = $('#batch-create-input textarea');
        $loading = $('#loading');
        $modal = $("#batch-modal");
        $spinner = $('.spinner');
        $start_button = $('#start-batch');

        setup_handlers();
    });
}
