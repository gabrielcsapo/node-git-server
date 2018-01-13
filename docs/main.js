window.onload = function() {
  var Krayon = require('krayon');
  
  document.querySelector('#code').innerHTML = Krayon(document.querySelector('#code').innerHTML);
}
