var APIModule = require('./helpers/api.module.js');

$(function(){
  $('button.delete-confirm').click(function(){
    var $this = $(this),
      prev_text = $this.text();

    if (!$this.hasClass('disabled')){

      $this.addClass('disabled');
      $this.text('Deleting link...');

      APIModule.request('DELETE', '/archives/' + archive.guid + '/', null, {
        success: function(){
          window.location = url_link_browser;
        },
        error: function(jqXHR){
          $this.removeClass('disabled');
          $this.text(prev_text);
          APIModule.showError(jqXHR);
        }
      });
    }
    return false;
  });
});
