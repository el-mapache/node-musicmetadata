var fs     = require('fs');
var events = require('events');
var strtok = require('strtok');
var binary = require('binary');
var common = require('./common');
//var MemoryStream = require('memstream').MemoryStream;
var MemoryStream = require('memorystream');
    
var Ogg = module.exports = function(stream) {
    this.stream = stream;
    this.parse();
};

Ogg.prototype = new process.EventEmitter();

Ogg.prototype.parse = function() {
  var self = this;

  var innerStream = new events.EventEmitter();

  // try {
    // top level parser that handles the parsing of pages
    strtok.parse(self.stream, function(v, cb) {
      if (!v) {
        cb.commentsRead = 0;
        cb.position = 'header'; //read first OggS header
        return new strtok.BufferType(27);
      }
          
      if (cb.position === 'header') {
        cb.header = {
          type: v.toString('utf-8', 0, 4),
          version: v[4],
          packet_flag: v[5],
          pcm_sample_pos: 'not_implemented',
          stream_serial_num: strtok.UINT32_LE.get(v, 14),
          page_number: strtok.UINT32_LE.get(v, 18),
          check_sum: strtok.UINT32_LE.get(v, 22),
          segments: v[26]
        };

        //read segment table
        cb.position = 'segments';
        return new strtok.BufferType(cb.header.segments);
      }
          
      if (cb.position === 'segments') {
        var pageLen = 0;
        for (var i=0; i < v.length; i++) {
          pageLen += v[i];
        }

        cb.position = 'page_data';
        return new strtok.BufferType(pageLen);
      }      

      if (cb.position === 'page_data') {
        if (cb.header.page_number >= 1) {
          innerStream.emit('data', v);
        }

        cb.position = 'header';
        return new strtok.BufferType(27);
      }
    })



    // Second level parser that handles the parsing of metadata.
    // The top level parser emits data that this parser should
    // handle.
    strtok.parse(innerStream, function(v, cb) {
      console.log('val:', v);
      //console.log('pos: ', cb.position);
      if (!v) {
        //console.log('in this');
        //console.log(innerStream);
        cb.position = 'type'; //read first OggS header
        return new strtok.BufferType(7);
      }

      if (cb.position === 'type') {
        console.log('type: ', v.toString());
        cb.position = 'vendor_length';
        return strtok.UINT32_LE;
      }

      if (cb.position === 'vendor_length') {
        //console.log('vendor_length: ', v);
        cb.position = 'vendor_string';
        return new strtok.StringType(v);
      }

      if (cb.position === 'vendor_string') {
        //console.log('vendor_string: ', v.toString())
        cb.position = 'user_comment_list_length';
        return strtok.UINT32_LE;
      }

      if (cb.position === 'user_comment_list_length') {
        cb.commentsLength = v;
        cb.position = 'comment_length';
        return new strtok.BufferType(4);
      }

      if (cb.position === 'comment_length') {
        console .log('comment_length: ', v);
        cb.position = 'comment';

        return new strtok.StringType(v.readUInt32LE(0));
      }

      if (cb.position === 'comment') {
        if (!cb.comments_read) {
          cb.comments_read = 0;
        }
        cb.comments_read++;

        console.log(v);

        var i = v.indexOf('=');
        var split = [v.slice(0, i), v.slice(i+1)];

        if (split[0] === 'METADATA_BLOCK_PICTURE') {  
          var decoded = new Buffer(split[1], 'base64');
          var picture = common.readVorbisPicture(decoded);
          split[1] = picture;
        }
        
        self.emit(split[0].toUpperCase(), split[1]);

        if (cb.comments_read === cb.commentsLength) {
          self.emit('done');
          return strtok.DONE;
        }

        cb.position = 'comment_length';
        return new strtok.BufferType(4);
      }
    })

    var total = 0;
    innerStream.on('data', function (result) {
      //console.log(result.toString('hex'));
      total += result.length;
      console.log(total);
    })



    


  // } catch (exception) {
  //   self.emit('done', exception);
  //   return strtok.DONE;
  // }
}