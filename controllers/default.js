exports.install = function() {
	F.route('/', get_users);
	// or
	// F.route('/');
};

require('dotenv').config({path: '../wissenLaravel/.env'});
//console.log(process.env.JWT_SECRET);

var socketio = require('socket.io');

F.on("load", function() {
	self 		= this;
	self.io 	= socketio.listen(this.server);

	var count_clients 	= 0;
	var all_clts 		= [];
	var info_evento 	= {
		examen_iniciado: 		false, 
		preg_actual: 			0,
		free_till_question: 	-1
	};


	self.io.on('connection',function(socket){
		console.log('New connection: '+socket.id);

		socket.join('principal');


		count_clients++;

		datos 					= {};
		datos.logged 			= false;
		datos.registered 		= false;
		datos.resourceId		= socket.id;
		datos.categsel			= 0;
		datos.respondidas		= 0;
		datos.correctas			= 0;
		datos.tiempo			= 0;
		datos.nombre_punto		= 'Punto_' + count_clients;
		datos.user_data 		= {};
		socket.datos 			= datos;

		all_clts.push(socket.datos);

		socket.emit('te_conectaste', {datos: socket.datos});
		socket.broadcast.emit('conectado:alguien', {clt: socket.datos} );


		socket.on('reconocer:punto:registered',function(data){
			if (data.nombre_punto) {
				socket.datos.nombre_punto = data.nombre_punto;
			}
			if (data.registered) {
				socket.datos.registered = data.registered;
			}
			
			for(var i=0; i < all_clts.length; i++){
				if (all_clts[i].resourceId == socket.id) {
					all_clts.splice(i, 1, socket.datos);
				}
			}
			
			datos = {nombre_punto: socket.datos.nombre_punto, resourceId: socket.id, registered: socket.datos.registered };
			self.io.sockets.emit('reconocido:punto:registered', datos );
		});

		socket.on('guardar:mi_qr:resourceId',function(data){
			if ( data.qr) {
				parametro 		= { "resourceId": socket.datos.resourceId };
				parametro  		= JSON.stringify(parametro);
				set_param_to_codigo_qr(data.qr, parametro).then(function(){
					//console.log('en guardar:mi_qr:resourceId');
				});
			}
		});

		socket.on('loguear',function(data){
			if (data.usuario.eventos) {
				delete data.usuario.eventos;
			}
			socket.datos.user_data 		= data.usuario;
			socket.datos.logged 		= true;

			if (socket.datos.user_data.inscripciones > 0) {
				socket.datos.categsel 	= socket.datos.user_data.inscripciones[0].categoria_id;
			}
			socket.broadcast.emit('logueado:alguien', {clt: socket.datos} );
			socket.emit('logueado:yo', { info_evento: info_evento } );
		});

		socket.on('get_clts', function(data){
			socket.emit('take:clientes',{ clts: all_clts, info_evento: info_evento });
		});


		socket.on('get_usuarios', function(data){
			get_users(socket.datos.user_data.evento_selected_id).then(function(usuarios) {
				socket.emit('take:usuarios', { usuarios: usuarios });
			})
		});

		socket.on('let_him_enter', function(data){
			var jwt 		= require('jsonwebtoken');
			var secret 		= process.env.JWT_SECRET;
			var decoded 	= jwt.verify(data.from_token, secret);
			
			if (decoded.sub) {

				get_user(data.usuario_id).then(function(usuario){
					socket.broadcast.to(data.resourceId).emit('enter', {usuario: usuario, from_token: data.from_token}); 
				});
			}

		});



		socket.on('message',function(data){
			console.log(data);
			socket.broadcast.emit('receive',data.message);

		});


		// clean up when a user leaves, and broadcast it to other users
		socket.on('disconnect', function () {
			
			for (var i = 0; i < all_clts.length; i++) {
				if (all_clts[i].resourceId == socket.id) {
					all_clts.splice(i, 1);
				}
			}
			socket.broadcast.emit('user:left', {
				resourceId: socket.datos.resourceId
			});
		});

	});

  
});




function set_param_to_codigo_qr(qr, param) {
	var self = this;
	return new Promise(function(resolve, reject) {


		var mysql      = require('mysql');
		var connection = mysql.createConnection({
		  host     : 'localhost',
		  user     : 'root',
		  password : '',
		  database : 'wissen_system_db'
		});

		connection.connect(function(err) {
			if (err) {
				console.error('error connecting: ' + err.stack);
				return reject(err);
			}
		});

		connection.query('UPDATE qrcodes SET ? WHERE codigo = ?', [{parametro: param}, qr], function (error, results) {
			if (error) throw error;
			/*
			if (results.length > 0) {
				return results[0];
			}*/
			resolve(results.affectedRows);
		});

		connection.end();
	});
}




function get_users(evento_id) {
	var self = this;
	return new Promise(function(resolve, reject) {

		var mysql      = require('mysql');
		var connection = mysql.createConnection({
		  host     : 'localhost',
		  user     : 'root',
		  password : '',
		  database : 'wissen_system_db'
		});

		connection.connect(function(err) {
			if (err) { console.error('error connecting: ' + err.stack); return reject(err); }
		});
		default_female 	= 'perfil/system/avatars/female1.jpg';
    	default_male 	= 'perfil/system/avatars/male1.jpg';

		consulta = `SELECT u.id, u.nombres, u.apellidos, u.sexo, u.username, u.email, u.is_superuser, 
							u.cell, u.edad, u.idioma_main_id, u.evento_selected_id, 
							IFNULL(e.nivel_id, "") as nivel_id, e.pagado, e.pazysalvo, u.entidad_id, 
							u.imagen_id, IFNULL(CONCAT("perfil/", i.nombre), IF(u.sexo="F", ?, ?)) as imagen_nombre,
							en.nombre as nombre_entidad, en.lider_id, en.lider_nombre, en.logo_id, en.alias  
						FROM users u 
						inner join ws_user_event e on e.user_id = u.id and e.evento_id = ? 
						left join images i on i.id=u.imagen_id and i.deleted_at is null 
						left join ws_entidades en on en.id=u.entidad_id and en.deleted_at is null 
						where u.deleted_at is null`;

		connection.query(consulta, [default_female, default_male, evento_id], function (error, results, fields) {
			if (error) throw error;
			resolve(results);
		});
		connection.end();
	});

}


function get_user(usuario_id) {
	var self = this;
	return new Promise(function(resolve, reject) {

		var mysql      = require('mysql');
		var connection = mysql.createConnection({
		  host     : 'localhost',
		  user     : 'root',
		  password : '',
		  database : 'wissen_system_db'
		});

		connection.connect(function(err) {
			if (err) { console.error('error connecting: ' + err.stack); return reject(err); }
		});
		consulta = `SELECT id, nombres, username FROM users WHERE id=?`;

		connection.query(consulta, [usuario_id], function (error, results, fields) {
			if (error) throw error;
			resolve(results[0]);
		});
		connection.end();
	});

}

