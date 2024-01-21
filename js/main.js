const GRAVITY = 0.5; // Downward acceleration due to gravity
const THRUSTER_ACCELERATION = 1.5; // Acceleration applied when using thrusters
const LANDING_PRECISION = 30; // Distance in pixels to start vertical landing
const MAX_SAFE_LANDING_SPEED = 100; // Maximum safe speed for landing without exploding

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.lives = 3;
        this.taxiSpeed = 200;
        this.autoPilot = true;
        this.taxiSpeedX = 0; // Horizontal speed
        this.taxiSpeedY = 0; // Vertical speed
        this.maxSpeed = 200; // Maximum speed
        this.acceleration = 10; // Acceleration rate
        this.deceleration = 10; // Deceleration rate
        
        this.currentPad = null; // Current platform where the taxi is
        this.destinationPad = null; // Destination platform for the taxi
        this.taxiLandingStage = 'ascending'; // Stages: 'ascending', 'moving', 'descending'
        this.earningsCountdown = 100;
        this.totalEarnings = 0;
        
        this.destinationText = null;
        this.idleTimer = null;
        this.havePasseger = false;
    }

    preload() {
        // Load the sprite for the taxi
        this.load.image('taxi', 'assets/images/taxi.png');

        // Load the tilemap JSON
        this.load.tilemapTiledJSON('demo', 'assets/tiles/demo.json');
        // Load the tileset image
        this.load.image('tiles', 'assets/images/pattern1.png');

        // Load the sprite for the platforms
        this.load.image('platform', 'assets/images/platform.png');

        // Load the sprites for the passengers
        // this.load.image('passenger', 'assets/images/passenger.png');

        // If you have different types or states of passengers, load them here
        // this.load.image('passengerHappy', 'assets/images/passengerHappy.png');
        // this.load.image('passengerSad', 'assets/images/passengerSad.png');

        // Load background image
        // this.load.image('background', 'assets/images/background.png');

        // Load UI elements like buttons, icons, etc.
        // this.load.image('button', 'assets/images/button.png');
        // this.load.image('icon', 'assets/images/icon.png');

        // Load any special effects, like particle sprites
        // this.load.image('particle', 'assets/images/particle.png');

        // Load any additional assets as needed
    }

    create() {
        // Create platforms
        this.platforms = this.physics.add.staticGroup();
        this.createPlatforms();

        // Create taxi sprite
        this.taxi = this.physics.add.sprite(100, 100, 'taxi');
        this.taxi.setCollideWorldBounds(true);

        this.cursors = this.input.keyboard.createCursorKeys();

        // Setup passenger logic
        this.currentPad = 'Pad3';
        this.destinationPad = 'Pad2';

        // Enable collision between the taxi and platforms
        this.physics.add.collider(this.taxi, this.platforms);

		// Footer background (optional for better visibility)
		const footerHeight = 50; // Height of the footer area
		const footerY = this.cameras.main.height - footerHeight;
		this.add.rectangle(0, footerY, this.cameras.main.width, footerHeight, 0x000000).setOrigin(0);

        // Display for passenger message
        this.messageText = this.add.text(20, footerY - 15, 'Hey taxi!', { fontSize: '14px', fill: '#fff' });

        // Display for total earnings
        this.totalEarningsText = this.add.text(20, footerY + 5, 'Earnings: $0', { fontSize: '14px', fill: '#fff' });

        // Display for earnings countdown
        this.earningsCountdownText = this.add.text(200, footerY + 5, 'Next Earnings: $100', { fontSize: '14px', fill: '#fff' });

        // Display for number of lives
        // this.livesText = this.add.text(380, footerY + 5, 'Lives: 3', { fontSize: '14px', fill: '#fff' });

        // Display for destination
        this.destinationText = this.add.text(560, footerY + 5, 'Destination: Pad 1', { fontSize: '14px', fill: '#fff' });
 
		// Area for dynamic image display
		//this.dynamicImage = this.add.image(400, footerY + 25, 'initialImage').setDisplaySize(40, 40).setOrigin(0.5, 0.5);

        // Set the initial platform and destination
        this.setCurrentPlatform('Pad1'); // Assuming the taxi starts at Pad1
        this.setRandomDestination();
    }

    update() {
        // Deceleration factor
        const deceleration = 5;

        // Handling left and right movement
        if (this.cursors.left.isDown) {
            this.taxi.setVelocityX(-this.taxiSpeed);
            this.autoPilot = false;
            this.resetIdleTimer();
        } else if (this.cursors.right.isDown) {
            this.taxi.setVelocityX(this.taxiSpeed);
            this.autoPilot = false;
            this.resetIdleTimer();
        } else {
            // Gradually decrease the X velocity to 0
            this.taxi.setVelocityX(this.taxi.body.velocity.x - Math.sign(this.taxi.body.velocity.x) * deceleration);
            if (Math.abs(this.taxi.body.velocity.x) < deceleration) {
                this.taxi.setVelocityX(0);
            }
        }

        // Handling up and down movement
        if (this.cursors.up.isDown) {
            this.taxi.setVelocityY(-this.taxiSpeed);
            this.autoPilot = false;
            this.resetIdleTimer();
        } else if (this.cursors.down.isDown) {
            this.taxi.setVelocityY(this.taxiSpeed);
            this.autoPilot = false;
            this.resetIdleTimer();
        } else {
            // Gradually decrease the Y velocity to 0
            this.taxi.setVelocityY(this.taxi.body.velocity.y - Math.sign(this.taxi.body.velocity.y) * deceleration);
            if (Math.abs(this.taxi.body.velocity.y) < deceleration) {
                this.taxi.setVelocityY(0);
            }
        }

        // Logic for moving taxi
        if (this.autoPilot) {
            this.moveTaxi();
        } else {
            const taxiLanded = this.checkTaxiPosition();
            if (taxiLanded && this.havePasseger) {
                this.dropOffPassenger();
            }
        }

        // Check if the taxi has reached the bottom of the playable area
        const maxY = this.sys.game.config.height - 80;
        if (this.taxi.y > maxY) {
            this.explodeTaxi();
        }

        const earningsDecrement = 0.1;
        if (this.earningsCountdown > earningsDecrement && this.taxiLandingStage != '') {
            this.earningsCountdown = this.earningsCountdown - earningsDecrement;
            this.updateEarningsCountdown(this.earningsCountdown);
        }
    }

    loadLevel(levelKey) {
        // Load the tilemap for the given level
        const map = this.make.tilemap({ key: levelKey });
        const tileset = map.addTilesetImage('Tileset', 'tiles'); // 'Tileset' is the name used in Tiled

        // Create the layers
        const platforms = map.createLayer('Platforms', tileset); // 'Platforms' is the layer name in Tiled

        // Set collision for the platforms layer
        platforms.setCollisionByProperty({ collides: true });

        // Setup collision between the taxi and the platforms layer
        this.physics.add.collider(this.taxi, platforms);

        // Load and setup passengers, and other level-specific elements...
    }

    resetIdleTimer() {
        const idleTimerSeconds = 30;

        // Clear the existing timer
        if (this.idleTimer) {
            this.idleTimer.remove();
        }
    
        // Set a new timer for 30 seconds
        this.idleTimer = this.time.delayedCall((1000 * idleTimerSeconds), () => {
            this.autoPilot = true;
        });
    }

    createPlatforms() {
        // Create platforms (pads) at specific positions
        this.platforms.create(100, 280, 'platform').setName('Pad1');
        this.platforms.create(350, 280, 'platform').setName('Pad2');
        this.platforms.create(600, 280, 'platform').setName('Pad3');
    }

    setCurrentPlatform(platformName) {
        this.currentPlatform = platformName;
    }
    
    setRandomDestination() {
        const platformNames = ['Pad1', 'Pad2', 'Pad3'];
        const availablePlatforms = platformNames.filter(name => name !== this.currentPlatform);
        const randomPlatform = Phaser.Utils.Array.GetRandom(availablePlatforms);
        this.destinationPlatform = randomPlatform;
        this.taxiLandingStage = 'ascending'; // Start the taxi movement sequence
        this.earningsCountdown = 100;
        this.havePasseger = true;

        this.updateDestination(randomPlatform);
    }

    setRandomDestinationAfterDelay() {
        // Random delay between 3000ms (3s) and 10000ms (10s)
        const delay = Phaser.Math.Between(3000, 10000);

        // Set a timer to change the destination after the delay
        this.time.delayedCall(delay, () => {
            this.setRandomDestination();
        });
    }    

    checkTaxiPosition() {
        const destination = this.platforms.getChildren().find(p => p.name === this.destinationPlatform);
        const distanceX = destination.x - this.taxi.x;
        const distanceY = destination.y - this.taxi.y - 120;

        // Define a threshold for how close the taxi needs to be to the destination
        const threshold = 30; // Adjust as needed
    
        // Check if the taxi is within the threshold distance of the destination
        return Math.abs(distanceX) < threshold && Math.abs(distanceY) < threshold;
    }

    dropOffPassenger() {
        this.havePasseger = false;
        this.taxi.setVelocityY(0);
        this.setCurrentPlatform(this.destinationPlatform);
        this.taxiLandingStage = '';
        if (this.earningsCountdown > 0) {
            this.totalEarnings += this.earningsCountdown;
            this.updateTotalEarnings(this.totalEarnings);
        }
        this.setRandomDestinationAfterDelay(); // Set a new destination for the next trip
    }

    moveTaxi() {
        const destination = this.platforms.getChildren().find(p => p.name === this.destinationPlatform);
    
        if (this.taxiLandingStage === 'ascending') {
            // Move the taxi upwards
            if (this.taxi.y > 100) { // Arbitrary height limit
                this.taxi.setVelocityY(-this.taxiSpeed);
            } else {
                this.taxiLandingStage = 'moving';
            }
        } else if (this.taxiLandingStage === 'moving') {
            // Move the taxi horizontally to the destination
            const distanceX = destination.x - this.taxi.x; // Calculate horizontal distance to the destination
        
            if (this.taxiLandingStage === 'moving') {
                if (Math.abs(distanceX) > this.taxiSpeed) {
                    // If the taxi is far from the destination, move at full speed
                    this.taxi.setVelocityX(Math.sign(distanceX) * this.taxiSpeed);
                } else {
                    // If the taxi is close to the destination, move with reduced speed
                    this.taxi.setVelocityX(Math.sign(distanceX) * Math.abs(distanceX));
                    if (Math.abs(distanceX) < 5) { // A small threshold to stop the taxi when it's very close
                        this.taxi.setVelocityX(0);
                        this.taxiLandingStage = 'descending';
                    }
                }
            }
        } else if (this.taxiLandingStage === 'descending') {
            // Lower the taxi down to the platform
            //if (this.taxi.y < destination.y) {
            //        if (this.checkTaxiPosition()) {
            if (this.taxi.y < 150) {
                this.taxi.setVelocityY(20);
            } else {
                this.dropOffPassenger();
            }
        }
    }

	// Function to update total earnings display
	updateTotalEarnings(earnings) {
		this.totalEarningsText.setText(`Earnings: $${earnings.toFixed(2)}`);
	}

	// Function to update earnings countdown display
	updateEarningsCountdown(earnings) {
		this.earningsCountdownText.setText(`Next Earnings: $${earnings.toFixed(2)}`);
	}

	// Function to update the number of lives
	updateLives(lives) {
		this.livesText.setText(`Lives: ${lives}`);
	}

	// Function to update the destination
	updateDestination(destination) {
		this.destinationText.setText(`Destination: ${destination}`);
	}

	explodeTaxi() {
		// Logic to handle taxi explosion
		// Penalize player and reset taxi position
        this.taxi.setVelocityX(0);
        this.taxi.setVelocityY(0);

        // Decrease the number of lives
        this.lives -= 1;

        // Update the display of lives
        this.updateLivesDisplay();
    }
	
	// Function to start the timer when a passenger is picked up
	startDropOffTimer() {
		this.dropOffTimer = this.time.now;
	}

    // Function to update total earnings display
    updateTotalEarnings(earnings) {
        this.totalEarningsText.setText(`Earnings: $${earnings.toFixed(2)}`);
    }

    // Function to update earnings countdown display
    updateEarningsCountdown(earnings) {
        this.earningsCountdownText.setText(`Next Earnings: $${earnings.toFixed(2)}`);
    }

    // Function to update dynamic image
    updateDynamicImage(imageKey) {
        this.dynamicImage.setTexture(imageKey);
    }

    updateLivesDisplay() {
        // Assuming you have a text object for lives display
        this.livesText.setText(`Lives: ${this.lives}`);
    }
}

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [MainScene]
};

const game = new Phaser.Game(config);
