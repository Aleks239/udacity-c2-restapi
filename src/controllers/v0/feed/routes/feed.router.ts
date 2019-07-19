import { Router, Request, Response } from 'express';
import { FeedItem } from '../models/FeedItem';
import { requireAuth } from '../../users/routes/auth.router';
import * as AWS from '../../../../aws';
import axios from "axios";
import { config } from "../../../../config/config";

const router: Router = Router();

// Get all feed items
router.get('/', async (req: Request, res: Response) => {
    const items = await FeedItem.findAndCountAll({ order: [['id', 'DESC']] });
    items.rows.map((item) => {
        if (item.url) {
            item.url = AWS.getGetSignedUrl(item.url);
        }
    });
    res.send(items);
});

// Get a specific resource
router.get('/:id',
    async (req: Request, res: Response) => {
        let { id } = req.params;
        const item = await FeedItem.findByPk(id);
        res.send(item);
    });

// update a specific resource
router.patch('/:id',
    requireAuth,
    async (req: Request, res: Response) => {
        //@TODO try it yourself
        let { id } = req.params;
        const caption = req.body.caption;
        const fileName = req.body.url;
        if (!caption && !fileName) {
            return res.status(400).send({ message: 'Caption or url is required or malformed' });
        }
        const item = await FeedItem.findByPk(id);
        if (item) {
            const updated_feed = await item.update({
                url: fileName,
                caption: caption
            })
            res.status(201).send(updated_feed);
        }
    });


// Get a signed url to put a new item in the bucket
router.get('/signed-url/:fileName',
    requireAuth,
    async (req: Request, res: Response) => {
        let { fileName } = req.params;
        const url = AWS.getPutSignedUrl(fileName);
        res.status(201).send({ url: url });
    });

// Post meta data and the filename after a file is uploaded 
// NOTE the file name is they key name in the s3 bucket.
// body : {caption: string, fileName: string};
router.post('/',
    requireAuth,
    async (req: Request, res: Response) => {
        const caption = req.body.caption;
        const fileName = req.body.url;

        // check Caption is valid
        if (!caption) {
            return res.status(400).send({ message: 'Caption is required or malformed' });
        }

        // check Filename is valid
        if (!fileName) {
            return res.status(400).send({ message: 'File url is required' });
        }
        try {
            const item = await new FeedItem({
                caption: caption,
                url: fileName
            });
            const saved_item = await item.save();
            const signedPutUrlForFilteredImage = AWS.getPutSignedUrl(item.url);

            saved_item.url = AWS.getGetSignedUrl(saved_item.url);

            //New request to imaging service
            const file = await axios.post(`${config.dev.imaging_service_url}/filterimage`,
                { image_url: saved_item.url }, {
                    responseType: "arraybuffer"
                });
            if (file) {
                if (file.data) {
                    await axios.put(signedPutUrlForFilteredImage, new Buffer(file.data, 'binary'), {
                        headers: {
                            'Content-Type': "image/jpeg"
                        }
                    })
                }
            }
            res.status(201).send(saved_item);
        } catch (e) {
            console.log(e.message)
            res.status(500).send(e.message);
        }


    });

export const FeedRouter: Router = router;