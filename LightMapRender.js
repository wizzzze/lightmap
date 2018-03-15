var LightMapRenderer = function(scene, renderer){
	this.scene = scene;
	this.renderer = renderer;
	this.shadowMapSize = new THREE.Vector2(512, 512);
	this._gl = renderer.context;
}


LightMapRenderer.prototype = {

	render : function(){
		var scene = this.scene;

		var i,j,child;
		for(var i = 0, j = scene.children.length; i < j; i++){
			child = scene.children[i];
			if(child.isDirectionalLight){
				this.DirectionalLightMapRender(child);
			}
		}

	},


	DirectionalLightMapRender : function(light){
		var renderer = this.renderer;
		var _state = renderer.state;

		_state.disable( this._gl.BLEND );
		_state.buffers.color.setClear( 1, 1, 1, 1 );
		_state.buffers.depth.setTest( true );
		_state.setScissorTest( false );

		var shadow = light.shadow;
		var shadowCamera = shadow.camera;

		if(!shadow.map){
			var pars = { minFilter: NearestFilter, magFilter: NearestFilter, format: RGBAFormat };

			shadow.map = new WebGLRenderTarget( shadow.mapSize.x, shadow.mapSize.y, pars );
			shadow.map.texture.name = light.name + ".shadowMap";

			shadowCamera.updateProjectionMatrix();
		}

		var map = shadow.map;
		console.log(map);


		var _lightPositionWorld = new Vector3();

		_lightPositionWorld.setFromMatrixPosition( light.matrixWorld );
		shadowCamera.position.copy( _lightPositionWorld );


	}

}